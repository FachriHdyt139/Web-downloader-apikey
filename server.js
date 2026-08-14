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

// --- ROUTE 1: YOUTUBE MP3 (Stabil pakai RapidAPI) ---
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

// --- FUNGSI BANTUAN: Resolve Link Pendek TikTok ke Link Panjang ---
async function resolveTikTokUrl(shortUrl) {
    try {
        if (shortUrl.includes('vt.tiktok.com') || shortUrl.includes('vm.tiktok.com')) {
            const response = await axios.get(shortUrl, { maxRedirects: 0, validateStatus: () => true, timeout: 5000 });
            if (response.headers.location) {
                return response.headers.location;
            }
        }
        return shortUrl;
    } catch (e) {
        return shortUrl;
    }
}

// --- ROUTE 2: TIKTOK VIDEO (SISTEM HYBRID STREAMING ANTI-GAGAL) ---
app.get('/api/download/tiktok', async (req, res) => {
    let videoUrl = req.query.url;
    if (!videoUrl) return res.status(400).json({ error: "Link TikTok kosong!" });

    // ==========================================
    // METODE 1: PAKSA API RAPIDAPI + STREAMING LANGSUNG (Sesuai Manual Resmi)
    // ==========================================
    try {
        console.log("[Metode 1] Mencoba API RapidAPI Resmi...");
        
        // 1. Resolve link pendek dulu biar nggak kena Error 400
        const longUrl = await resolveTikTokUrl(videoUrl);
        console.log(`[Metode 1] Link diubah ke: ${longUrl}`);

        const options = {
            method: 'GET',
            url: `https://${TT_HOST}/media`,
            params: { videoUrl: longUrl }, // Pakai link panjang!
            headers: { 
                'x-rapidapi-key': RAPIDAPI_KEY, 
                'x-rapidapi-host': TT_HOST 
            },
            timeout: 10000
        };

        const response = await axios.request(options);
        const data = response.data;
        
        let directLink = data.downloadUrl || data.download_url;
        let title = data.title || "TikTok Video";
        let thumb = data.thumbnail || data.cover || "";

        if (directLink && directLink.startsWith('http')) {
            console.log("[Metode 1] BERHASIL! Link didapat. Melakukan streaming langsung agar tidak hangus...");
            
            // KUNCI RAHASIA: Stream langsung dari server Render ke Browser User
            // Ini mengatasi masalah "session-based URL" yang cuma berlaku 1 detik
            const videoStream = await axios({
                method: 'GET',
                url: directLink,
                responseType: 'stream',
                timeout: 15000
            });

            res.setHeader('Content-Type', 'video/mp4');
            res.setHeader('Content-Disposition', `attachment; filename="fachri-dev-tiktok.mp4"`);
            videoStream.data.pipe(res);
            console.log("[Metode 1] Streaming selesai!");
            return; // Selesai, jangan lanjut ke metode 2
            
        } else {
            throw new Error("Respons API tidak mengandung downloadUrl.");
        }
    } catch (err1) {
        console.warn(`[Metode 1] Gagal: ${err1.message}. Melanjutkan ke Metode 2...`);
        // Reset header kalau sempat ke-set
        res.removeHeader('Content-Type');
        res.removeHeader('Content-Disposition');
    }

    // ==========================================
    // METODE 2: FALLBACK SCRAPING HTML (Penyamaran Browser Tingkat Dewa)
    // ==========================================
    try {
        console.log("[Metode 2] Mencoba Bypass Scraping HTML...");
        
        const longUrl = await resolveTikTokUrl(videoUrl);

        const response = await axios.get(longUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://www.tiktok.com/'
            },
            timeout: 10000
        });

        const html = response.data;
        let cleanUrl = null;
        
        const patterns = [
            /"playAddr":"(.*?)"/,
            /"downloadAddr":"(.*?)"/,
            /"play_addr":\{"url_list":$$"(.*?)"$$/,
            /https:\/\/v[0-9]+-[a-z]+\.tiktokcdn\.com\/.*?\.mp4/
        ];

        for (let pattern of patterns) {
            const match = html.match(pattern);
            if (match && match[1]) {
                cleanUrl = match[1].replace(/\\\//g, '/');
                break;
            }
        }

        const titleMatch = html.match(/"desc":"(.*?)"/) || html.match(/<title>(.*?)<\/title>/);
        const thumbMatch = html.match(/"cover":"(.*?)"/) || html.match(/"originCover":"(.*?)"/);

        if (cleanUrl) {
            console.log("[Metode 2] BERHASIL mengekstrak via HTML! Mengembalikan JSON...");
            return res.json({
                success: true,
                title: titleMatch ? titleMatch[1].replace(/\\/g, '').substring(0, 100) : "TikTok Video",
                link: cleanUrl,
                thumb: thumbMatch ? thumbMatch[1].replace(/\\\//g, '') : ""
            });
        } else {
            throw new Error("Pola video tidak ditemukan di HTML.");
        }

    } catch (err2) {
        console.error("[Metode 2] Gagal Total:", err2.message);
        res.status(500).json({ 
            error: "Sistem Hybrid Gagal. Kemungkinan: 1. Quota RapidAPI habis, 2. Video di-private/dihapus, 3. TikTok memblokir IP server Render saat ini. Coba lagi nanti." 
        });
    }
});

app.listen(PORT, () => console.log(`🚀 Server FACHRI DEV berjalan di port ${PORT}`));
