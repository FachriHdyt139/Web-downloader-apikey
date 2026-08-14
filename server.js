// Memuat modul yang dibutuhkan
const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// --- KONFIGURASI API KEY (Hanya untuk YouTube) ---
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY; 
const YT_HOST = 'youtube-mp36.p.rapidapi.com';

// --- FUNGSI BANTUAN: Ekstrak ID YouTube ---
function extractYouTubeId(url) {
    try {
        if (url.includes('v=')) return url.split('v=')[1].split('&')[0];
        if (url.includes('youtu.be/')) return url.split('youtu.be/')[1].split('?')[0];
        if (url.includes('shorts/')) return url.split('shorts/')[1].split('?')[0];
        return url.split('/').pop().split('?')[0];
    } catch (e) { return null; }
}

// --- ROUTE 1: YOUTUBE MP3 (Tetap pakai RapidAPI) ---
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
        res.status(500).json({ error: "Gagal fetch YouTube. Cek API Key/Quota di Render." });
    }
});

// --- ROUTE 2: TIKTOK VIDEO (JURUS PAMUNGKAS: MULTI-PROXY FALLBACK) ---
app.get('/api/download/tiktok', async (req, res) => {
    const videoUrl = req.query.url;
    if (!videoUrl) return res.status(400).json({ error: "Link TikTok kosong!" });

    // Daftar Server Perantara (Proxy) Publik yang stabil di 2026
    // Kita akan coba satu per satu sampai ada yang berhasil mengembalikan link video
    const proxies = [
        {
            name: 'TikWM Primary',
            url: 'https://www.tikwm.com/api/',
            method: 'post',
            data: { url: videoUrl, hd: 1 },
            extract: (d) => ({ link: d.data.hd || d.data.play, title: d.data.title, thumb: d.data.cover })
        },
        {
            name: 'TikWM GET Fallback',
            url: `https://www.tikwm.com/api/?url=${encodeURIComponent(videoUrl)}&hd=1`,
            method: 'get',
            extract: (d) => ({ link: d.data.hd || d.data.play, title: d.data.title, thumb: d.data.cover })
        }
    ];

    let lastError = null;

    for (let proxy of proxies) {
        try {
            console.log(`Mencoba proxy: ${proxy.name}...`);
            const config = {
                method: proxy.method,
                url: proxy.url,
                headers: { 'Content-Type': 'application/json' }
            };
            if (proxy.data) config.data = proxy.data;

            const response = await axios(config, { timeout: 10000 }); // Timeout 10 detik
            
            if (response.data && response.data.code === 0 && response.data.data) {
                const result = proxy.extract(response.data);
                if (result.link && result.link.startsWith('http')) {
                    console.log(`Berhasil via ${proxy.name}!`);
                    return res.json({
                        success: true,
                        title: result.title || "TikTok Video",
                        link: result.link,
                        thumb: result.thumb || ""
                    });
                }
            }
            throw new Error("Respons proxy tidak mengandung link video.");
            
        } catch (err) {
            lastError = err;
            console.warn(`Proxy ${proxy.name} gagal: ${err.message}. Mencoba alternatif...`);
            continue; // Lanjut ke proxy berikutnya
        }
    }

    console.error("Semua proxy TikTok gagal.", lastError?.message);
    res.status(500).json({ 
        error: "Semua server perantara TikTok sedang sibuk atau memblokir permintaan. Coba lagi dalam 1 menit, atau pastikan link benar-benar publik." 
    });
});

app.listen(PORT, () => console.log(`🚀 Server FACHRI DEV berjalan di port ${PORT}`));
