// Memuat modul yang dibutuhkan
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
require('dotenv').config(); // Untuk membaca API Key yang disembunyikan

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Menyajikan file HTML/CSS/JS

// --- KONFIGURASI API KEY (AMBIL DARI ENVIRONMENT VARIABLES RENDER) ---
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY; 
const YT_HOST = 'youtube-mp36.p.rapidapi.com';
const TT_HOST = 'tiktok-video-downloader-api.p.rapidapi.com';

// --- ROUTE 1: DOWNLOAD YOUTUBE MP3 ---
app.get('/api/download/youtube', async (req, res) => {
    const videoUrl = req.query.url;

    if (!videoUrl) {
        return res.status(400).json({ error: "Link YouTube tidak boleh kosong!" });
    }

    // Fungsi sederhana untuk ekstrak ID YouTube dari berbagai jenis link
    let videoId = '';
    try {
        if (videoUrl.includes('v=')) {
            videoId = videoUrl.split('v=')[1].split('&')[0];
        } else if (videoUrl.includes('youtu.be/')) {
            videoId = videoUrl.split('youtu.be/')[1].split('?')[0];
        } else if (videoUrl.includes('shorts/')) {
            videoId = videoUrl.split('shorts/')[1].split('?')[0];
        } else {
            // Fallback jika format aneh, coba ambil bagian terakhir
            videoId = videoUrl.split('/').pop().split('?')[0];
        }
    } catch (e) {
        return res.status(400).json({ error: "Format link YouTube tidak dikenali." });
    }

    if (!videoId) {
        return res.status(400).json({ error: "Gagal membaca ID Video YouTube." });
    }

    try {
        const options = {
            method: 'GET',
            url: `https://${YT_HOST}/dl`,
            params: { id: videoId },
            headers: {
                'x-rapidapi-key': RAPIDAPI_KEY,
                'x-rapidapi-host': YT_HOST
            }
        };

        const response = await axios.request(options);
        
        // Mengembalikan data ke frontend
        res.json({
            success: true,
            title: response.data.title || "YouTube Audio",
            link: response.data.link, // Link download langsung
            thumb: response.data.thumb
        });

    } catch (error) {
        console.error("Error YT:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: "Gagal mengambil data YouTube. Cek API Key atau coba lagi nanti." });
    }
});

// --- ROUTE 2: DOWNLOAD TIKTOK VIDEO ---
// Catatan: API TikTok yang kamu berikan contoh endpoint-nya adalah /user/{username}.
// Untuk download video via link, biasanya endpoint-nya berbeda (misal /video atau /download).
// Sensei sesuaikan logika di bawah ini agar mencoba mencari endpoint download yang umum di RapidAPI tersebut.
// Jika error, kita akan sesuaikan lagi berdasarkan dokumentasi spesifik API itu.
app.get('/api/download/tiktok', async (req, res) => {
    const videoUrl = req.query.url;

    if (!videoUrl) {
        return res.status(400).json({ error: "Link TikTok tidak boleh kosong!" });
    }

    try {
        // Kebanyakan API TikTok di RapidAPI menerima parameter 'url'
        const options = {
            method: 'GET',
            url: `https://${TT_HOST}/video`, // Mencoba endpoint /video (umum)
            params: { url: videoUrl },
            headers: {
                'x-rapidapi-key': RAPIDAPI_KEY,
                'x-rapidapi-host': TT_HOST
            }
        };

        // Jika endpoint /video gagal, beberapa API menggunakan POST atau path lain.
        // Kita coba request dulu.
        const response = await axios.request(options);

        // Struktur respons API TikTok bervariasi, kita coba tangkap yang paling mungkin
        const data = response.data;
        let downloadLink = '';

        // Logika deteksi link download (karena struktur JSON API beda-beda)
        if (data.data && data.data.wmplay) downloadLink = data.data.wmplay; // dengan watermark
        else if (data.data && data.data.nwmplay) downloadLink = data.data.nwmplay; // tanpa watermark
        else if (data.hd) downloadLink = data.hd;
        else if (data.video) downloadLink = data.video;
        else if (data.download_url) downloadLink = data.download_url;
        else downloadLink = data.link || JSON.stringify(data); // fallback

        res.json({
            success: true,
            title: data.title || "TikTok Video",
            link: downloadLink,
            thumb: data.cover || data.thumbnail
        });

    } catch (error) {
        console.error("Error TT:", error.response ? error.response.data : error.message);
        // Pesan error khusus kalau endpoint API-nya ternyata beda
        res.status(500).json({ 
            error: "Gagal mengambil data TikTok. Pastikan endpoint API RapidAPI kamu sudah benar (cek dokumentasi RapidAPI untuk path yang tepat, misal /video atau /download)." 
        });
    }
});

// Jalankan Server
app.listen(PORT, () => {
    console.log(`🚀 Server berjalan di port ${PORT}`);
    console.log(` Website siap diakses!`);
});
