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

// --- KONFIGURASI API KEY (Hanya untuk YouTube sekarang) ---
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

// --- ROUTE 1: YOUTUBE MP3 (Tetap pakai RapidAPI karena stabil) ---
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

// --- ROUTE 2: TIKTOK VIDEO (SENJATA PAMUNGKAS: BYPASS API, LANGSUNG SCRAPING) ---
app.get('/api/download/tiktok', async (req, res) => {
    let videoUrl = req.query.url;
    if (!videoUrl) return res.status(400).json({ error: "Link TikTok kosong!" });

    try {
        // 1. Kalau link pendek (vt.tiktok.com), kita harus resolve dulu ke link panjang
        if (videoUrl.includes('vt.tiktok.com') || videoUrl.includes('vm.tiktok.com')) {
            const redirectRes = await axios.get(videoUrl, { maxRedirects: 0, validateStatus: () => true });
            if (redirectRes.headers.location) {
                videoUrl = redirectRes.headers.location;
            }
        }

        // 2. Tembak halaman TikTok langsung dengan User-Agent browser (biar tidak diblokir)
        const response = await axios.get(videoUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
            }
        });

        const html = response.data;

        // 3. Ekstrak Data dari HTML (Mencari JSON tersembunyi di dalam halaman TikTok)
        // TikTok menyimpan data video di dalam tag <script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"> atau script lain
        let videoData = null;
        
        // Metode A: Cari URL video langsung via Regex (Paling ampuh untuk direct download)
        // Mencari pola playAddr atau downloadAddr
        const videoUrlMatch = html.match(/"playAddr":"(.*?)"/) || html.match(/"downloadAddr":"(.*?)"/) || html.match(/"play_addr":\{"url_list":$$"(.*?)"$$/);
        
        // Metode B: Cari judul
        const titleMatch = html.match(/"desc":"(.*?)"/) || html.match(/<title>(.*?)<\/title>/);
        
        // Metode C: Cari thumbnail
        const thumbMatch = html.match(/"cover":"(.*?)"/) || html.match(/"originCover":"(.*?)"/);

        if (videoUrlMatch && videoUrlMatch[1]) {
            // Bersihkan URL dari escape character JSON (misal \/ menjadi /)
            let cleanUrl = videoUrlMatch[1].replace(/\\\//g, '/');
            
            // Kadang URL butuh parameter tambahan biar bisa didownload langsung
            if (!cleanUrl.includes('tiktokcdn.com')) {
                 // Fallback kalau regex pertama gagal dapat CDN utama
                 const cdnMatch = html.match(/https:\/\/v[0-9]+-[a-z]+\.tiktokcdn\.com\/.*?\.mp4/);
                 if(cdnMatch) cleanUrl = cdnMatch[0];
            }

            let cleanTitle = titleMatch ? titleMatch[1].replace(/\\/g, '') : "TikTok Video";
            let cleanThumb = thumbMatch ? thumbMatch[1].replace(/\\\//g, '/') : "";

            return res.json({
                success: true,
                title: cleanTitle.substring(0, 100), // Batasi panjang judul
                link: cleanUrl,
                thumb: cleanThumb
            });
        } else {
            throw new Error("Pola video tidak ditemukan di halaman. Mungkin video di-private atau TikTok mengubah struktur webnya.");
        }

    } catch (error) {
        console.error("TT Bypass Error:", error.message);
        res.status(500).json({ 
            error: "Gagal mengekstrak TikTok. Pastikan: 1. Link publik (bukan private), 2. Video tidak dihapus. (Sistem bypass API sedang bekerja)." 
        });
    }
});

app.listen(PORT, () => console.log(`🚀 Server FACHRI DEV berjalan di port ${PORT}`));
