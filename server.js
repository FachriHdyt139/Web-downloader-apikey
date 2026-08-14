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

// --- ROUTE 2: TIKTOK VIDEO (SISTEM HYBRID ANTI-GAGAL) ---
app.get('/api/download/tiktok', async (req, res) => {
    let videoUrl = req.query.url;
    if (!videoUrl) return res.status(400).json({ error: "Link TikTok kosong!" });

    // ==========================================
    // METODE 1: PAKSA API RAPIDAPI (Sesuai Manual Resmi + Agresif)
    // ==========================================
    try {
        console.log("[Metode 1] Mencoba API RapidAPI Resmi...");
        const options = {
            method: 'GET',
            url: `https://${TT_HOST}/media`,
            params: { videoUrl: videoUrl },
            headers: { 
                'x-rapidapi-key': RAPIDAPI_KEY, 
                'x-rapidapi-host': TT_HOST 
            },
            timeout: 8000 // Timeout cepat biar kalau gagal langsung fallback
        };

        const response = await axios.request(options);
        const data = response.data;
        
        // Sesuai docs, respons utamanya di 'downloadUrl'
        let directLink = data.downloadUrl || data.download_url;
        let title = data.title || "TikTok Video";
        let thumb = data.thumbnail || data.cover || "";

        if (directLink && directLink.startsWith('http')) {
            console.log("[Metode 1] BERHASIL! Link didapat, memvalidasi session...");
            
            // KUNCI RAHASIA: Karena link ini session-based (hangus dalam 1 detik),
            // Kita lakukan HEAD request super cepat untuk memastikan link masih hidup
            // sebelum memberikannya ke frontend.
            try {
                await axios.head(directLink, { timeout: 3000 });
                console.log("[Metode 1] Link valid dan siap dikirim!");
                return res.json({ success: true, title, link: directLink, thumb });
            } catch (headErr) {
                console.warn("[Metode 1] Link hangus/too slow. Jatuh ke Metode 2.");
            }
        } else {
            throw new Error("Respons API tidak mengandung downloadUrl.");
        }
    } catch (err1) {
        console.warn(`[Metode 1] Gagal: ${err1.message}. Melanjutkan ke Metode 2...`);
    }

    // ==========================================
    // METODE 2: FALLBACK SCRAPING HTML (Penyamaran Browser Tingkat Dewa)
    // ==========================================
    try {
        console.log("[Metode 2] Mencoba Bypass Scraping HTML...");
        
        // 1. Resolve link pendek dulu
        if (videoUrl.includes('vt.tiktok.com') || videoUrl.includes('vm.tiktok.com')) {
            const redirectRes = await axios.get(videoUrl, { maxRedirects: 0, validateStatus: () => true, timeout: 5000 });
            if (redirectRes.headers.location) videoUrl = redirectRes.headers.location;
        }

        // 2. Tembak dengan User-Agent Chrome 125 terbaru (Anti-Bot Detection)
        const response = await axios.get(videoUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://www.tiktok.com/'
            },
            timeout: 8000
        });

        const html = response.data;

        // 3. Regex tingkat dewa untuk mencari URL video di dalam JSON tersembunyi TikTok
        // TikTok menyimpan data di window.__UNIVERSAL_DATA_FOR_REHYDRATION__ atau script serupa
        let cleanUrl = null;
        
        // Pola pencarian berlapis
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
            console.log("[Metode 2] BERHASIL mengekstrak via HTML!");
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
            error: "Sistem Hybrid Gagal. Kemungkinan: 1. Quota RapidAPI habis, 2. Video di-private/dihapus, 3. TikTok memperketat blokir IP server Render saat ini. Coba lagi nanti." 
        });
    }
});

app.listen(PORT, () => console.log(`🚀 Server FACHRI DEV berjalan di port ${PORT}`));
