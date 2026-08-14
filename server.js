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
        incrementStat(); // Tambah statistik
        res.json({
            success: true,
            title: cleanTitle(response.data.title), // 🤖 AI Cleaner Aktif!
            link: response.data.link,
            thumb: response.data.thumb
        });
    } catch (error) {
        console.error("YT Error:", error.response?.data || error.message);
        res.status(500).json({ error: "Gagal fetch YouTube. Cek API Key/Quota di Render." });
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
app.get('/api/download/tiktok', async (req, res) => {
    let videoUrl = req.query.url;
    if (!videoUrl) return res.status(400).json({ error: "Link TikTok kosong!" });

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

app.listen(PORT, () => console.log(`🚀 Server FACHRI DEV Ultimate v3.0 berjalan di port ${PORT}`));
