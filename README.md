<div align="center">

# 🚀 Media Downloader by FACHRI DEV

**Enterprise High-Speed Media Downloader** — Unduh MP3 & Video dari YouTube, TikTok, dan SoundCloud dalam satu aplikasi web modern.

[![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express)](https://expressjs.com)
[![RapidAPI](https://img.shields.io/badge/RapidAPI-Powered-0084FF?logo=rapidapi)](https://rapidapi.com)
[![PWA](https://img.shields.io/badge/PWA-Enabled-5A0FC8)](https://developer.mozilla.org/docs/Web/Progressive_web_apps)
[![Deploy](https://img.shields.io/badge/Deploy-Render-46E3B7?logo=render)](https://render.com)

**Dibuat dengan ❤️ oleh [FACHRI DEV](https://github.com/FachriHdyt139)**

</div>

---

## ✨ Fitur Unggulan

| 🎵 YouTube MP3 | 🎬 TikTok Video | 🎧 SoundCloud MP3 |
|---|---|---|
| Unduh audio MP3 dari video YouTube | Unduh video TikTok tanpa watermark | Cari & unduh lagu dari SoundCloud |
| Preview thumbnail otomatis (gratis, tanpa kuota) | Dukungan link pendek `vt.tiktok.com` | Dukungan link share `on.soundcloud.com` |
| Nama file MP3 yang rapi | Sistem Hybrid 2 metode (API + scraping) | Streaming MP3 berkualitas standar |

### ⚡ Bonus Fitur
- 🔗 **Auto-Detect Link** — tempel link, tab & preview otomatis berpindah
- 🤖 **AI Title Cleaner** — judul dibersihkan otomatis (hapus hashtag, emoji, karakter aneh)
- 📊 **Statistik Harian** — jumlah unduhan hari ini
- 📜 **Riwayat Download** — tersimpan di browser (5 terakhir)
- 🌙 **Dark / Light Mode** — tema bisa diganti
- 📱 **PWA** — bisa di-*install* sebagai aplikasi di HP
- 🎨 **Responsif & Mobile-First** — desain glassmorphism yang cantik

---

## 🖥️ Teknologi

| | |
|---|---|
| **Runtime** | Node.js 20.x |
| **Framework** | Express.js |
| **HTTP Client** | Axios |
| **API** | RapidAPI (`youtube-mp36`, `tiktok-video-downloader-api`, `soundcloud-scraper1`) |
| **SoundCloud Engine** | [soundcloud-downloader](https://www.npmjs.com/package/soundcloud-downloader) |
| **Frontend** | HTML + CSS + JavaScript (vanilla, single file) |

---

## 🚀 Menjalankan di Lokal

### 1. Persyaratan
- Node.js 20+ & npm
- **API Key RapidAPI** — daftar di [rapidapi.com](https://rapidapi.com) lalu subscribe ke:
  - `youtube-mp36`
  - `tiktok-video-downloader-api`
  - `soundcloud-scraper1`

### 2. Clone & Install
```bash
git clone https://github.com/FachriHdyt139/Web-downloader-apikey.git
cd Web-downloader-apikey
npm install
```

### 3. Konfigurasi Environment
Buat file `.env` di folder project:
```env
RAPIDAPI_KEY=isi_api_key_kamu_disini
```

### 4. Jalankan
```bash
npm start
```
Buka **http://localhost:3000** di browser. 🎉

---

## ☁️ Deploy ke Render

1. Fork / push repo ini ke GitHub
2. Di [render.com](https://render.com) → **New** → **Web Service** → sambungkan repo
3. Pengaturan otomatis terdeteksi:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. Tambah **Environment Variable**:
   ```env
   RAPIDAPI_KEY=isi_api_key_kamu_disini
   ```
5. **Create Web Service** → tunggu status **Live** → situs online!

> 💡 *Free tier Render akan "tidur" setelah 15 menit tidak diakses. Kunjungan pertama setelah tidur butuh ±1 menit (cold start) — itu normal.*

---

## 📁 Struktur Project

```
Web-downloader-apikey/
├── server.js            # Server utama (Express + semua route API)
├── package.json         # Konfigurasi & dependency
├── .env                 # API key (JANGAN di-commit)
├── .gitignore           # Node modules, log, .env
└── public/
    ├── index.html       # Frontend lengkap (tab, preview, history)
    ├── manifest.json    # Konfigurasi PWA
    └── sw.js            # Service worker PWA
```

---

## 📡 Endpoint API

| Method | Endpoint | Keterangan |
|---|---|---|
| `GET` | `/api/download/youtube?url=<link>` | Unduh MP3 YouTube (balas JSON: `title`, `link`, `thumb`) |
| `GET` | `/api/download/tiktok?url=<link>&format=json` | Unduh video TikTok (hybrid streaming/scraping) |
| `GET` | `/api/download/soundcloud?url=<link>` | Streaming MP3 SoundCloud |
| `GET` | `/api/download/soundcloud/search?q=<judul>` | Cari lagu SoundCloud (balas daftar lagu) |
| `GET` | `/api/download/soundcloud/info?url=<link>` | Info lagu + artwork untuk preview |
| `GET` | `/api/stats` | Jumlah unduhan hari ini |

---

## 📜 Riwayat Perubahan

| Versi | Fitur |
|---|---|
| **v3.0** | 🎧 Tab SoundCloud (cari + link pendek) |
| **v2.x** | 🖼️ Preview thumbnail otomatis, AI Title Cleaner, PWA |
| **v1.0** | 🎵 YouTube MP3 + 🎬 TikTok Video |

---

<div align="center">

**© 2026 FACHRI DEV** · Made with ❤️ & banyak kopi ☕

</div>