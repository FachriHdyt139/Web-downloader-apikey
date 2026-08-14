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

// --- ROUTE 1: YOUTUBE MP3 ---
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

// --- ROUTE 2: TIKTOK VIDEO (FIX FINAL SESUAI DOKUMENTASI RESMI) ---
app.get('/api/download/tiktok', async (req, res) => {
    const videoUrl = req.query.url;
    if (!videoUrl) return res.status(400).json({ error: "Link TikTok kosong!" });

    try {
        // Dokumentasi resmi API ini menggunakan endpoint '/media' dan parameter 'videoUrl'
        const options = {
            method: 'GET',
            url: `https://${TT_HOST}/media`,
            params: { videoUrl: videoUrl }, // <-- INI KUNCI UTAMANYA
            headers: { 
                'x-rapidapi-key': RAPIDAPI_KEY, 
                'x-rapidapi-host': TT_HOST 
            }
        };

        const response = await axios.request(options);
        const data = response.data;

        // Berdasarkan docs, respons utamanya ada di 'downloadUrl'
        // Kita tambahkan fallback kalau strukturnya sedikit berbeda
        let downloadLink = data.downloadUrl || data.download_url || data.url || data.video;
        let title = data.title || "TikTok Video";
        let thumb = data.thumbnail || data.cover || data.thumb;

        if (downloadLink && downloadLink.startsWith('http')) {
            res.json({ 
                success: true, 
                title: title, 
                link: downloadLink, 
                thumb: thumb 
            });
        } else {
            // Kalau API berhasil dipanggil (status 200) tapi link tidak ketemu
            console.error("TT Respons aneh:", data);
            res.status(500).json({ error: "API TikTok merespons, tapi link download tidak ditemukan. Mungkin video private/dihapus." });
        }

    } catch (error) {
        console.error("TT Error:", error.response?.data || error.message);
        let errMsg = "Gagal mengambil data TikTok.";
        if (error.response?.status === 401 || error.response?.status === 403) {
            errMsg = "API Key salah atau kuota RapidAPI habis.";
        } else if (error.response?.status === 429) {
            errMsg = "Batas penggunaan API terlampaui (Too Many Requests).";
        }
        res.status(500).json({ error: errMsg });
    }
});

app.listen(PORT, () => console.log(`🚀 Server FACHRI DEV berjalan di port ${PORT}`));
