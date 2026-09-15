// Memuat modul yang dibutuhkan
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// --- SECURITY: Helmet untuk security headers ---
app.use(helmet({
    contentSecurityPolicy: false, // Disable karena kita inline CSS/JS
    crossOriginEmbedderPolicy: false
}));

// --- SECURITY: Rate Limiting ---
const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 menit
    max: 30, // Maksimal 30 request per menit per IP
    message: { error: "Terlalu banyak request. Silakan tunggu 1 menit." },
    standardHeaders: true,
    legacyHeaders: false,
});

const downloadLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 menit
    max: 10, // Maksimal 10 download per menit per IP
    message: { error: "Batas download tercapai. Silakan tunggu 1 menit." },
    standardHeaders: true,
    legacyHeaders: false,
});

// --- SECURITY: CORS Configuration ---
const allowedOrigins = process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : null;

const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, curl, etc)
        if (!origin) return callback(null, true);
        
        // Jika tidak ada ALLOWED_ORIGINS yang diset, allow semua (development mode)
        if (!allowedOrigins) return callback(null, true);
        
        // Cek apakah origin ada di whitelist
        if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
            callback(null, true);
        } else {
            callback(new Error('Origin tidak diizinkan oleh CORS'));
        }
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400 // Preflight cache 24 jam
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static('public'));

// --- KONFIGURASI API KEY ---
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY; 
const YT_HOST = 'youtube-mp36.p.rapidapi.com';
const TT_HOST = 'tiktok-video-downloader-api.p.rapidapi.com';
const SC_HOST = 'soundcloud-scraper1.p.rapidapi.com';
const soundcloud = require('soundcloud-downloader').default;

// --- INPUT SANITIZATION ---
function sanitizeInput(input) {
    if (!input || typeof input !== 'string') return '';
    return input
        .replace(/[<>]/g, '') // Hapus karakter HTML
        .replace(/javascript:/gi, '') // Hapus javascript:
        .replace(/on\w+=/gi, '') // Hapus event handler
        .trim()
        .substring(0, 2048); // Batasi panjang URL
}

function isValidUrl(url) {
    try {
        const parsed = new URL(url);
        return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
        return false;
    }
}

// --- SISTEM STATISTIK HARIAN (Reset tiap 24 jam) ---
let dailyStats = { count: 0, date: new Date().toDateString() };
function incrementStat() {
    const today = new Date().toDateString();
    if (dailyStats.date !== today) {
        dailyStats = { count: 1, date: today }; // Reset kalau ganti hari
    } else {
        dailyStats.count++;
    }
}
app.get('/api/stats', (req, res) => {
    const today = new Date().toDateString();
    if (dailyStats.date !== today) dailyStats = { count: 0, date: today };
    res.json({ todayDownloads: dailyStats.count });
});

// --- 🤖 AI TITLE CLEANER (Regex Tingkat Dewa 2026) ---
function cleanTitle(title) {
    if (!title) return "Media Download";
    let clean = title;
    // 1. Hapus Hashtag (#kata)
    clean = clean.replace(/#[a-zA-Z0-9_]+/g, '');
    // 2. Hapus Emoji (Unicode Regex terbaru 2026)
    clean = clean.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '');
    // 3. Hapus karakter aneh & spasi ganda
    clean = clean.replace(/[^a-zA-Z0-9\s\-_.,!?]/g, '').replace(/\s+/g, ' ').trim();
    return clean.substring(0, 80) || "Media Download"; // Batasi 80 karakter biar nama file tidak kepanjangan
}

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
app.get('/api/download/youtube', downloadLimiter, async (req, res) => {
    const videoUrl = sanitizeInput(req.query.url);
    if (!videoUrl) return res.status(400).json({ error: "Link YouTube tidak boleh kosong." });
    if (!isValidUrl(videoUrl)) return res.status(400).json({ error: "Format link YouTube tidak valid." });
    const videoId = extractYouTubeId(videoUrl);
    if (!videoId) return res.status(400).json({ error: "Format link YouTube tidak dikenali." });

    try {
        const response = await axios.get(`https://${YT_HOST}/dl`, {
            params: { id: videoId },
            headers: { 'x-rapidapi-key': RAPIDAPI_KEY, 'x-rapidapi-host': YT_HOST }
        });
        incrementStat(); // Tambah statistik
        res.json({
            success: true,
            title: cleanTitle(response.data.title), // 🤖 AI Cleaner Aktif!
            link: response.data.link,
            thumb: response.data.thumb
        });
    } catch (error) {
        console.error("YT Error:", error.response?.data || error.message);
        res.status(500).json({ error: "Gagal memproses video YouTube. Silakan coba lagi." });
    }
});

// --- FUNGSI BANTUAN: Resolve Link Pendek TikTok ---
async function resolveTikTokUrl(shortUrl) {
    try {
        if (shortUrl.includes('vt.tiktok.com') || shortUrl.includes('vm.tiktok.com')) {
            const response = await axios.get(shortUrl, { maxRedirects: 0, validateStatus: () => true, timeout: 5000 });
            if (response.headers.location) return response.headers.location;
        }
        return shortUrl;
    } catch (e) { return shortUrl; }
}

// --- ROUTE 2: TIKTOK VIDEO (HYBRID STREAMING + AI CLEANER) ---
app.get('/api/download/tiktok', downloadLimiter, async (req, res) => {
    let videoUrl = sanitizeInput(req.query.url);
    if (!videoUrl) return res.status(400).json({ error: "Link TikTok tidak boleh kosong." });
    if (!isValidUrl(videoUrl)) return res.status(400).json({ error: "Format link TikTok tidak valid." });

    // METODE 1: API RAPIDAPI + STREAMING
    try {
        console.log("[Metode 1] Mencoba API RapidAPI Resmi...");
        const longUrl = await resolveTikTokUrl(videoUrl);
        const options = {
            method: 'GET', url: `https://${TT_HOST}/media`, params: { videoUrl: longUrl },
            headers: { 'x-rapidapi-key': RAPIDAPI_KEY, 'x-rapidapi-host': TT_HOST }, timeout: 10000
        };
        const response = await axios.request(options);
        const data = response.data;
        let directLink = data.downloadUrl || data.download_url;
        let title = data.title || "TikTok Video";

        if (directLink && directLink.startsWith('http')) {
            console.log("[Metode 1] BERHASIL! Streaming langsung...");
            incrementStat(); // Tambah statistik
            
            // Kalau frontend minta JSON (untuk history), kembalikan JSON
            if (req.query.format === 'json') {
                return res.json({ success: true, title: cleanTitle(title), link: directLink, thumb: data.thumbnail || "" });
            }
            
            // Kalau tidak, stream langsung (default)
            const videoStream = await axios({ method: 'GET', url: directLink, responseType: 'stream', timeout: 15000 });
            const cleanFilename = cleanTitle(title).replace(/\s+/g, '_');
            res.setHeader('Content-Type', 'video/mp4');
            res.setHeader('Content-Disposition', `attachment; filename="${cleanFilename}.mp4"`);
            videoStream.data.pipe(res);
            return;
        } else { throw new Error("Respons API tidak mengandung downloadUrl."); }
    } catch (err1) {
        console.warn(`[Metode 1] Gagal: ${err1.message}. Melanjutkan ke Metode 2...`);
        res.removeHeader('Content-Type'); res.removeHeader('Content-Disposition');
    }

    // METODE 2: FALLBACK SCRAPING HTML
    try {
        console.log("[Metode 2] Mencoba Bypass Scraping HTML...");
        const longUrl = await resolveTikTokUrl(videoUrl);
        const response = await axios.get(longUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36', 'Referer': 'https://www.tiktok.com/' }, timeout: 10000
        });
        const html = response.data;
        let cleanUrl = null;
        const patterns = [/"playAddr":"(.*?)"/, /"downloadAddr":"(.*?)"/, /"play_addr":\{"url_list":$$"(.*?)"$$/, /https:\/\/v[0-9]+-[a-z]+\.tiktokcdn\.com\/.*?\.mp4/];
        for (let pattern of patterns) { const match = html.match(pattern); if (match && match[1]) { cleanUrl = match[1].replace(/\\\//g, '/'); break; } }
        
        const titleMatch = html.match(/"desc":"(.*?)"/) || html.match(/<title>(.*?)<\/title>/);
        const thumbMatch = html.match(/"cover":"(.*?)"/) || html.match(/"originCover":"(.*?)"/);

        if (cleanUrl) {
            console.log("[Metode 2] BERHASIL via HTML!");
            incrementStat();
            return res.json({
                success: true,
                title: cleanTitle(titleMatch ? titleMatch[1].replace(/\\/g, '') : "TikTok Video"),
                link: cleanUrl, thumb: thumbMatch ? thumbMatch[1].replace(/\\\//g, '') : ""
            });
        } else { throw new Error("Pola video tidak ditemukan di HTML."); }
    } catch (err2) {
        console.error("[Metode 2] Gagal Total:", err2.message);
        res.status(500).json({ error: "Sistem Hybrid Gagal. Coba lagi nanti." });
    }
});

// --- FUNGSI BANTUAN: Ekstrak URL SoundCloud dari teks ---
function extractSoundcloudUrl(text) {
    const m = String(text || '').trim().match(/(?:https?:\/\/)?(?:[\w-]+\.)*soundcloud\.com\/[^\s'"<>]+/i);
    return m ? m[0].replace(/[.,;:!?'"]+$/, '') : null;
}

// --- FUNGSI BANTUAN: Ikuti redirect link pendek (on.soundcloud.com) ke URL penuh ---
async function resolveSoundcloudUrl(url) {
    let current = url;
    for (let i = 0; i < 5; i++) {
        try {
            const res = await axios.get(current, { maxRedirects: 0, validateStatus: () => true, timeout: 10000 });
            if (res.headers.location) { current = new URL(res.headers.location, current).toString(); continue; }
            break;
        } catch (e) { break; }
    }
    return current.split('?')[0]; // Buang query tracking (ref, utm_source, dll)
}

// --- ROUTE 3A: SOUNDCLOUD - PENCARIAN (via RapidAPI) ---
app.get('/api/download/soundcloud/search', apiLimiter, async (req, res) => {
    const query = sanitizeInput(req.query.q || '').trim();
    if (!query) return res.status(400).json({ error: "Kata kunci pencarian tidak boleh kosong." });
    try {
        const response = await axios.get(`https://${SC_HOST}/api/tracks/search`, {
            params: { query },
            headers: { 'x-rapidapi-key': RAPIDAPI_KEY, 'x-rapidapi-host': SC_HOST },
            timeout: 15000
        });
        const tracks = (response.data.data?.tracks || []).slice(0, 8).map(t => ({
            id: t.id,
            title: cleanTitle(t.title),
            thumb: t.artwork_url || "",
            permalink: t.permalink_url || "",
            duration: t.duration || 0
        }));
        res.json({ success: true, tracks });
    } catch (error) {
        console.error("SC Search Error:", error.response?.data || error.message);
        res.status(500).json({ error: "Gagal mencari di SoundCloud. Silakan coba lagi." });
    }
});

// --- ROUTE 3B: SOUNDCLOUD - INFO PREVIEW (resolve URL) ---
app.get('/api/download/soundcloud/info', apiLimiter, async (req, res) => {
    const trackUrl = extractSoundcloudUrl(sanitizeInput(req.query.url || ''));
    if (!trackUrl) return res.status(400).json({ error: "Link SoundCloud tidak valid." });
    try {
        const info = await soundcloud.getInfo(await resolveSoundcloudUrl(trackUrl));
        res.json({
            success: true,
            title: cleanTitle(info.title),
            thumb: info.artwork_url || "",
            id: info.id,
            permalink: info.permalink_url
        });
    } catch (error) {
        console.error("SC Info Error:", error.message);
        res.status(500).json({ error: "Gagal mengambil info SoundCloud. Pastikan link valid." });
    }
});

// --- ROUTE 3: SOUNDCLOUD - DOWNLOAD MP3 (Streaming) ---
app.get('/api/download/soundcloud', downloadLimiter, async (req, res) => {
    const trackUrl = extractSoundcloudUrl(sanitizeInput(req.query.url || ''));
    if (!trackUrl) return res.status(400).json({ error: "Link SoundCloud tidak boleh kosong." });
    try {
        const fullUrl = await resolveSoundcloudUrl(trackUrl);
        const info = await soundcloud.getInfo(fullUrl);
        const audioStream = await soundcloud.download(fullUrl);
        incrementStat();
        const cleanFilename = cleanTitle(info.title).replace(/\s+/g, '_');
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Disposition', `attachment; filename="${cleanFilename}.mp3"`);
        audioStream.pipe(res);
    } catch (error) {
        console.error("SC Download Error:", error.message);
        res.status(500).json({ error: "Gagal download dari SoundCloud. Coba lagi nanti." });
    }
});

app.listen(PORT, () => console.log(`🚀 Server FACHRI DEV Ultimate v3.1.0 berjalan di port ${PORT}`));
