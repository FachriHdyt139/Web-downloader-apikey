// Memuat modul yang dibutuhkan
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// --- KONFIGURASI API KEY ---
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY; 
const YT_HOST = 'youtube-mp36.p.rapidapi.com';
const TT_HOST = 'tiktok-video-downloader-api.p.rapidapi.com';

// --- FUNGSI BANTUAN: Ekstrak ID YouTube ---
function extractYouTubeId(url) {
    try {
        if (url.includes('v=')) return url.split('v=')[1].split('&')[0];
        if (url.includes('youtu.be/')) return url.split('youtu.be/')[1].split('?')[0];
        if (url.includes('shorts/')) return url.split('shorts/')[1].split('?')[0];
        return url.split('/').pop().split('?')[0];
    } catch (e) { return null; }
}

// --- FUNGSI BANTUAN: Ekstrak Info TikTok (Username/ID) ---
function extractTikTokInfo(url) {
    try {
        // Coba ambil username dari link profil (misal: tiktok.com/@username)
        if (url.includes('@')) {
            return { type: 'username', value: url.split('@')[1].split('/')[0].split('?')[0] };
        }
        // Untuk link video pendek (vt.tiktok.com), kita tidak bisa dapat username langsung tanpa resolve.
        // Kita akan kirimkan URL utuh ke API dan berharap API-nya cukup pintar, 
        // atau kita coba ekstrak bagian terakhir sebagai fallback.
        let lastPart = url.split('/').pop().split('?')[0];
        return { type: 'url_or_id', value: lastPart, fullUrl: url };
    } catch (e) { return null; }
}

// --- ROUTE 1: YOUTUBE MP3 (Sudah stabil, dipertahankan) ---
app.get('/api/download/youtube', async (req, res) => {
    const videoUrl = req.query.url;
    if (!videoUrl) return res.status(400).json({ error: "Link YouTube kosong!" });

    const videoId = extractYouTubeId(videoUrl);
    if (!videoId) return res.status(400).json({ error: "Format link YouTube tidak dikenali." });

    try {
        const response = await axios.get(`https://${YT_HOST}/dl`, {
            params: { id: videoId },
            headers: { 'x-rapidapi-key': RAPIDAPI_KEY, 'x-rapidapi-host': YT_HOST }
        });
        
        res.json({
            success: true,
            title: response.data.title || "YouTube Audio",
            link: response.data.link,
            thumb: response.data.thumb
        });
    } catch (error) {
        console.error("YT Error:", error.response?.data || error.message);
        res.status(500).json({ error: "Gagal fetch YouTube. Cek API Key/Quota." });
    }
});

// --- ROUTE 2: TIKTOK VIDEO (LOGIKA BARU SUPER PINTAR) ---
app.get('/api/download/tiktok', async (req, res) => {
    const videoUrl = req.query.url;
    if (!videoUrl) return res.status(400).json({ error: "Link TikTok kosong!" });

    const info = extractTikTokInfo(videoUrl);
    if (!info) return res.status(400).json({ error: "Format link TikTok aneh." });

    // Daftar kemungkinan endpoint & parameter berdasarkan pola umum RapidAPI TikTok
    // Kita akan coba satu per satu sampai ada yang sukses (Status 200)
    const attempts = [
        { method: 'get', url: `https://${TT_HOST}/video`, params: { url: videoUrl } },
        { method: 'get', url: `https://${TT_HOST}/download`, params: { url: videoUrl } },
        { method: 'get', url: `https://${TT_HOST}/url`, params: { url: videoUrl } },
        // Kalau API-nya ternyata butuh username (sesuai contoh R kamu)
        { method: 'get', url: `https://${TT_HOST}/user/${info.value}`, params: {} },
        { method: 'post', url: `https://${TT_HOST}/video`, data: { url: videoUrl } }
    ];

    let lastError = null;

    for (let attempt of attempts) {
        try {
            const config = {
                method: attempt.method,
                url: attempt.url,
                headers: { 
                    'x-rapidapi-key': RAPIDAPI_KEY, 
                    'x-rapidapi-host': TT_HOST,
                    'Content-Type': 'application/json'
                }
            };
            if (attempt.params) config.params = attempt.params;
            if (attempt.data) config.data = attempt.data;

            const response = await axios(config);
            
            // Jika sampai sini tanpa error, berarti endpoint ini BENAR!
            const data = response.data;
            let downloadLink = '';
            let title = 'TikTok Video';
            let thumb = '';

            // Deteksi struktur JSON (karena beda provider beda format)
            if (data.data) {
                downloadLink = data.data.nwmplay || data.data.wmplay || data.data.play || data.data.download;
                title = data.data.title || title;
                thumb = data.data.cover || data.data.origin_cover;
            } else if (data.result) {
                downloadLink = data.result.video || data.result.hd || data.result.url;
                title = data.result.title || title;
                thumb = data.result.cover;
            } else {
                // Fallback cari key yang mengandung 'http'
                const findUrl = (obj) => {
                    for (let k in obj) {
                        if (typeof obj[k] === 'string' && obj[k].startsWith('http') && (obj[k].includes('.mp4') || obj[k].includes('video'))) return obj[k];
                        if (typeof obj[k] === 'object') { let r = findUrl(obj[k]); if(r) return r; }
                    }
                    return null;
                };
                downloadLink = findUrl(data) || JSON.stringify(data);
            }

            if (downloadLink && downloadLink.startsWith('http')) {
                return res.json({ success: true, title, link: downloadLink, thumb });
            } else {
                throw new Error("Link download tidak ditemukan di respons API.");
            }

        } catch (err) {
            lastError = err;
            // Jika error 404 (Not Found) atau 405 (Method Not Allowed), lanjut coba attempt berikutnya
            if (err.response && (err.response.status === 404 || err.response.status === 405 || err.response.status === 400)) {
                continue; 
            }
            // Jika error 401/403 (Unauthorized) atau 429 (Quota), berhenti saja, percuma coba endpoint lain
            break;
        }
    }

    console.error("TT All Attempts Failed:", lastError?.response?.data || lastError?.message);
    res.status(500).json({ 
        error: "Semua metode API TikTok gagal. Kemungkinan: 1. Quota habis, 2. API Key salah, 3. Link TikTok private/dihapus. Cek tab 'Logs' di Render untuk detail." 
    });
});

app.listen(PORT, () => console.log(`🚀 Server FACHRI DEV berjalan di port ${PORT}`));
