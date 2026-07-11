<div align="center">
 
# Saka Tracker
 
**Monitoring progres lapangan SLS, real-time, offline-ready.**

![Version](https://img.shields.io/badge/version-5.8.0-3b82f6?style=flat-square)
![Status](https://img.shields.io/badge/status-stable-10b981?style=flat-square)
![PWA](https://img.shields.io/badge/PWA-installable-10b981?style=flat-square)
![Build Step](https://img.shields.io/badge/build_step-none-f59e0b?style=flat-square)
![License](https://img.shields.io/badge/license-internal-94a3b8?style=flat-square)

Dikembangkan oleh **Saka_Omni** &middot; Saka Omni Webapps

</div>

---

## Daftar Isi

### Saka Tracker
- [Tentang](#tentang)
- [Fitur Utama](#fitur-utama)
- [Tumpukan Teknologi](#tumpukan-teknologi)
- [Struktur Proyek](#struktur-proyek)
- [Menjalankan Secara Lokal](#menjalankan-secara-lokal)
- [Model Data](#model-data)
- [Versioning](#versioning)
- [Standar Ikon](#standar-ikon)
- [Keamanan & Privasi](#keamanan--privasi)
- [Riwayat Versi](#riwayat-versi)
- [Roadmap](#roadmap)

### FormGear Pro
- [FormGear Pro Overview](#formgear-pro-overview)
- [FormGear Features](#formgear-features)
- [FormGear Getting Started](#formgear-getting-started)
- [FormGear Recent Improvements](#formgear-recent-improvements)

- [Lisensi](#lisensi)
- [Kontak](#kontak)

---

## Tentang

Saka Tracker adalah alat bantu internal untuk PML/koordinator dalam memantau progres lapangan tingkat SLS pada Sensus Ekonomi 2026 (SE2026). Aplikasi membandingkan progres aktual terhadap dua target paralel — **Dashboard FASIH** (jumlah asesmen) dan **Muatan** (volume kontrak) — lalu menyajikan prioritisasi kerja, forecasting ketercapaian termin, dan insight strategis berbasis AI.

> Saka Tracker adalah alat bantu internal (field-ops tooling) dan **bukan produk resmi BPS**.

## Fitur Utama

| Kategori | Deskripsi |
|---|---|
| Dashboard Real-time | Ringkasan open/submit/reject/pending/approve per SLS dan agregat total |
| Prioritisasi Otomatis | Algoritma skor memprioritaskan SLS mana yang perlu ditangani lebih dulu |
| Forecasting Termin | Proyeksi ketercapaian target 40% dan 100% berdasarkan ritme input harian |
| Grading Performa | Penilaian A+ s/d E terhadap garis progres yang diharapkan |
| Multi-AI Insight | Orkestrasi OpenAI, Gemini, dan Mistral dengan fallback deterministik tanpa API key |
| Progressive Web App | Dapat dipasang ke layar utama, tetap berjalan saat offline |
| Consent Gate & PIN Lock | Lapisan persetujuan ToS/Privacy dan kunci akses opsional berbasis PIN |
| Backup & Restore | Ekspor/impor seluruh state aplikasi sebagai berkas JSON |

## Tumpukan Teknologi

![HTML5](https://img.shields.io/badge/HTML5-e34f26?style=flat-square&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572b6?style=flat-square&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-f7df1e?style=flat-square&logo=javascript&logoColor=black)
![Bootstrap Icons](https://img.shields.io/badge/Bootstrap_Icons-1.11.3-7952b3?style=flat-square&logo=bootstrap&logoColor=white)
![PWA](https://img.shields.io/badge/Service_Worker-enabled-5a0fc8?style=flat-square)

- **Vanilla JavaScript** — tanpa framework, tanpa bundler, tanpa dependensi npm.
- **Bootstrap Icons** (CDN) — satu-satunya resource eksternal, dipakai untuk seluruh indikator visual (tidak ada emoji di manapun dalam kode).
- **Browser-native APIs** — `localStorage`, `fetch`, `crypto.subtle` (hashing PIN), `FileReader`, Service Worker.
- **Zero backend** — seluruh data tersimpan di perangkat; tidak ada server maupun akun.

## Struktur Proyek

```
saka-tracker/
├── index.html        Aplikasi utama (single-file HTML + CSS + JS)
├── sw.js              Service Worker — caching aset & mode offline
├── manifest.json      Manifest PWA (ikon, nama, shortcut, versi)
├── SKILL.md           Spesifikasi teknis lengkap (arsitektur, formula, extension points)
└── README.md          Dokumen ini
```

## Menjalankan Secara Lokal

Service Worker memerlukan konteks HTTP (bukan `file://`), jadi jalankan lewat server statis sederhana:

```bash
# opsi 1 — Python
python3 -m http.server 8080

# opsi 2 — Node
npx serve .
```

Lalu buka `http://localhost:8080/` di browser. Untuk pengalaman PWA penuh (install ke layar utama, ikon, shortcut), sajikan proyek pada path `/sakahybrid/` sesuai konfigurasi `start_url` di `manifest.json`, atau sesuaikan path tersebut dengan lokasi deploy Anda.

## Model Data

Seluruh state tersimpan sebagai satu objek JSON di `localStorage` (kunci historis `saka_tracker_v5_4`, direferensikan lewat konstanta `STORAGE_KEY`):

```
state
├── config     { assessment, muatan }        // target, diturunkan dari data SLS
├── dashboard  { open, draft, submit, ... }   // agregat, diturunkan dari data SLS
├── sls[]      { kode, nama, open, submit, reject, pending, approve, muatan }
├── history[]  snapshot harian (progress, dashP, velocity, grade)
├── apiKeys    { openai, gemini, mistral }
├── consent    { accepted, version, date }
└── security   { pinEnabled, pinHash, recoveryHash, failedAttempts, lockUntil }
```

Detail lengkap formula (`prioritasSLS`, `performanceGrade`, forecasting) ada di `SKILL.md`.

## Versioning

Proyek ini mengikuti [Semantic Versioning](https://semver.org/) — `MAJOR.MINOR.PATCH`:

- **MAJOR** — perubahan tidak kompatibel ke belakang (mis. migrasi skema data).
- **MINOR** — penambahan fitur yang tetap kompatibel.
- **PATCH** — perbaikan bug tanpa perubahan perilaku.

Nomor versi yang identik harus tercermin di lima tempat setiap kali ada rilis:

| Berkas | Lokasi versi |
|---|---|
| `index.html` | konstanta `APP_VERSION` |
| `sw.js` | konstanta `SW_VERSION` & `CACHE_NAME` |
| `manifest.json` | field `"version"` |
| `SKILL.md` | header `Version documented` |
| `README.md` | badge versi di atas |

Karena proyek ini sengaja tanpa build step, sinkronisasi antar berkas dilakukan manual — namun aplikasi memverifikasi kecocokan versi secara otomatis saat runtime:

1. Saat Service Worker baru aktif, versinya dikirim ke halaman lewat `postMessage`.
2. Halaman membandingkan versi tersebut — dan juga versi di `manifest.json` yang di-*fetch* langsung — terhadap `APP_VERSION`-nya sendiri.
3. Ketidakcocokan dicatat sebagai `console.warn` di browser.
4. Jika Service Worker versi baru selesai terpasang, muncul pita **"Versi baru tersedia"** dengan tombol muat ulang.

`LEGAL_VERSION` (versi dokumen ToS/Privacy) sengaja independen dari `APP_VERSION` — hanya dinaikkan saat teks legal berubah, agar Consent Gate hanya muncul ulang saat benar-benar relevan. Lihat §12 pada `SKILL.md` untuk detail kontrak versioning ini.

**FormGear (`assets/formgear/`) punya lapisan versioning sendiri, terpisah dari `APP_VERSION` maupun dari versi masing-masing form:**

| Versi | Level | Naik saat |
|---|---|---|
| `FORMGEAR_ENGINE_VERSION` | Engine/templating (`form-builder.js` itu sendiri) | Kode engine berubah |
| `schemaVersion` | Bentuk data form definition | Skema `{sections, fields, ...}` berubah tak-kompatibel |
| `templateVersion` (per-form) | Satu form/template hasil buatan pengguna | Otomatis naik PATCH setiap kali form itu disimpan ulang |

Ketiganya sengaja **tidak** disinkronkan otomatis dengan `APP_VERSION` — sebuah rilis Saka Tracker bisa saja tidak menyentuh FormGear sama sekali, dan sebaliknya. Detail lengkap ada di §15.5 pada `SKILL.md`.

## Standar Ikon

Seluruh indikator visual dalam aplikasi menggunakan [Bootstrap Icons](https://icons.getbootstrap.com/) (`<i class="bi bi-...">`) — tidak ada emoji/emoticon di manapun, termasuk pada log console dan halaman offline fallback. Satu-satunya pengecualian adalah dialog native `alert()`/`confirm()`, yang secara teknis tidak dapat merender HTML/ikon sehingga menggunakan teks polos.

## Keamanan & Privasi

- **Tanpa data pribadi (PII)** — hanya menyimpan agregat angka dan label wilayah SLS/RT-RW; tidak pernah menyimpan nama, NIK, alamat, atau nomor telepon responden.
- **Consent Gate** — persetujuan ToS/Privacy Policy wajib sebelum aplikasi dapat digunakan.
- **PIN Lock opsional** — kunci akses 4 digit berbasis hash SHA-256 (bukan enkripsi data, murni gerbang UX perangkat).
- **API key tersimpan plaintext di localStorage** — cocok untuk penggunaan personal/single-user; tidak direkomendasikan untuk perangkat bersama.

## Riwayat Versi

| Versi | Ringkasan |
|---|---|
| 5.8.0 | FormGear kini punya versioning semVer sendiri, terpisah dari `APP_VERSION` Saka Tracker dan dari versi masing-masing form: `FORMGEAR_ENGINE_VERSION` (versi engine), `schemaVersion` (versi bentuk-data), dan `templateVersion` per-form (naik PATCH otomatis tiap disimpan ulang). Form lama otomatis dimigrasi saat dimuat. Badge versi ditampilkan di toolbar Form Builder dan di kartu katalog form. |
| 5.7.0 | Perbaikan bug FormGear: Form Builder yang tidak bisa dipakai sama sekali (ID kontainer salah), Firebase manager yang tidak ter-attach ke `window` (upload selalu gagal), listener Firebase yang menumpuk, dan inisialisasi ganda saat membuka tab FormGear. Tab FormGear kini menampilkan katalog form saja, form penuh tampil setelah kartu diklik. Form Builder kini 2 kolom penuh layar di desktop/tablet. |
| 5.6.0 | Integrasi FormGear lokal di folder assets, perbaikan render form dinamis, dan pembaruan semver aplikasi lintas halaman, service worker, dan manifest PWA. |
| 5.5.0 | Standardisasi seluruh ikon ke Bootstrap Icons (emoji dihapus total); sistem Semantic Versioning terpadu lintas berkas dengan sinkronisasi versi otomatis saat runtime antara halaman, Service Worker, dan manifest PWA. |
| 5.4.5 | Penyempurnaan Terms of Service & Privacy Policy; penambahan Consent Gate dan PIN Lock opsional. |

## Roadmap

- [ ] Visualisasi grafik progres harian (Chart.js)
- [ ] Sistem termin yang digeneralisasi (tidak lagi hardcoded satu milestone)
- [ ] Toast/modal kustom menggantikan `alert()`/`confirm()` native
- [ ] Halaman changelog in-app
- [ ] Ekspor analisis harian ke PDF/WhatsApp

Detail lengkap ada pada bagian *Extension Points* di `SKILL.md`.

## Lisensi

Proyek internal — hak cipta dipegang oleh **Saka Omni Webapps**. Tidak didistribusikan di bawah lisensi open-source publik; penggunaan di luar tim internal memerlukan izin dari pengembang.

## Kontak

Dikembangkan dan dirawat oleh **Saka_Omni**.
Untuk pertanyaan teknis atau permintaan fitur, hubungi developer melalui kontak yang tersedia di dalam aplikasi (halaman Pengaturan).

---

## FormGear Pro Overview

FormGear Pro adalah **advanced form builder** terintegrasi dengan Firebase Realtime Database dan mendukung multi-AI providers (OpenAI, Google Gemini, Mistral, ZAI) untuk code generation otomatis. Dibangun dengan Express.js + TypeScript, FormGear menghadirkan pengalaman form creation yang powerful dengan dukungan drag-drop, expert mode dengan conditional logic, nested fields, dan real-time Firebase sync.

**Lokasi:** `formgear-server/`

## FormGear Features

| Fitur | Deskripsi |
|-------|-----------|
| **Drag & Drop Builder** | Interface intuitif untuk membuat form tanpa coding |
| **14+ Field Types** | Text, Email, Number, Date, Select, Radio, Checkbox, File, Rating, Group, Repeat, Rating, dll |
| **Expert Mode** | Advanced features: conditional logic, formula editor, custom code editor, Firebase sync per field |
| **Nested Fields** | Support untuk parent-child field relationships dengan visual hierarchy |
| **AI Code Generation** | Gunakan AI untuk generate validation logic, formulas, dan transformations |
| **Multi-AI Fallback** | OpenAI → Gemini → Mistral → ZAI (fallback otomatis jika provider gagal) |
| **Firebase Integration** | Real-time sync, RTDB, form data persistence |
| **Export Formats** | HTML (standalone) & JSON (portable) |
| **Dark Theme** | SakaTracker-inspired design system dengan 16 CSS variables |
| **API Key Management** | Manual input atau sync dari Firebase dengan validation |
| **Field Type Color Coding** | 5 kategori field dengan visual distinction (blue, cyan, amber, purple, green) |

## FormGear Getting Started

### Prasyarat
- Node.js 16+
- npm atau yarn
- Firebase project + RTDB setup
- AI provider API keys (optional, akan fallback)

### Setup

```bash
cd formgear-server

# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env dengan Firebase credentials & AI API keys

# Build TypeScript
npm run build

# Start server
npm start
# Server berjalan di http://localhost:3000
```

### Akses Form Builder

Buka browser: **http://localhost:3000/form-builder.html**

### Environment Variables

```env
PORT=3000
CORS_ORIGIN=*

# Firebase
FIREBASE_API_KEY=...
FIREBASE_AUTH_DOMAIN=formgear.firebaseapp.com
FIREBASE_DATABASE_URL=https://formgear-default-rtdb.asia-southeast1.firebasedatabase.app
FIREBASE_PROJECT_ID=formgear
FIREBASE_STORAGE_BUCKET=formgear.firebasestorage.app
FIREBASE_MESSAGING_SENDER_ID=980081925784
FIREBASE_APP_ID=1:980081925784:web:...
FIREBASE_MEASUREMENT_ID=G-...

# AI Providers
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AIzaSy...
MISTRAL_API_KEY=mistral-...
ZAI_API_KEY=zai-...
```

## FormGear Recent Improvements

### Versi 2.2 - Sweet Alert Integration & Authorization Header Fixes (2026-07-11)

✅ **Complete UI/UX Overhaul & Backend Fixes:**

1. **Sweet Alert 2 Integration**
   - Replaced all JavaScript `alert()` dialogs dengan Sweet Alert modals
   - Created comprehensive `showAlert` utility dengan 7 jenis dialog: success/error/warning/info/loading/confirm/html
   - Semua notifikasi sekarang user-friendly dengan visual indicators
   - Translations ke Bahasa Indonesia untuk semua pesan

2. **Authorization Header Fixes**
   - Fixed corrupted Authorization headers di aiRoutes.ts (lines 245, 409, 731, 755)
   - Headers now properly formatted: `Authorization: \`Bearer ${apiKey}\``
   - Enables proper authentication dengan OpenAI, Gemini, Mistral, ZAI APIs
   - Test endpoint now returns proper 401/auth errors (not malformed header errors)

3. **Enhanced API Testing UI**
   - Redesigned testAllProviders() dengan HTML-formatted results
   - Per-provider status display dengan color-coded badges:
     - ✅ Green (#10b981) untuk successful connections
     - ❌ Red (#ef4444) untuk failed connections
   - Visual feedback dengan loading indicators
   - Detailed error messages per provider

4. **Fixed API Payload Format**
   - Corrected form-builder.html payload: `apiKeys` → `keys` (matches backend expectations)
   - Fixed both saveApiKeys() dan syncUsage() functions
   - Proper Firebase sync dengan correct payload structure

### Versi 2.1 - Field Type Visual Distinction & Scroll Responsiveness (2026-07-11)

✅ **3 Critical Fixes Applied:**

1. **Field Type Color Coding** 
   - Setiap field type punya warna & badge unik
   - 5 kategori: Text (Blue), Number (Cyan), Select (Amber), File (Purple), Group (Green)
   - Visual left border (5px) sesuai tipe
   - Enhanced hover & selection states

2. **Smooth Scroll Responsiveness**
   - Smooth scroll-behavior di canvas, sidebar, properties panel
   - Custom webkit-scrollbar styling (thin, dark theme colors)
   - Responsive container sizing untuk better UX

3. **Accurate API Key Firebase Sync**
   - Added ZAI API key support (4 total providers)
   - Fixed saveApiKeys() dengan proper payload structure
   - Enhanced syncUsage() dengan proper Firebase endpoint
   - Visual sync status indicator dengan timestamp
   - Better error handling & validation

### Struktur FormGear

```
formgear-server/
├── src/
│   ├── index.ts                 Express app entry point
│   ├── routes/
│   │   ├── formRoutes.ts        CRUD operations (/api/forms/*)
│   │   └── aiRoutes.ts          AI generation (/api/ai/*)
│   └── config/
│       └── firebase.ts           Firebase initialization
├── public/
│   ├── form-builder.html         Main UI (1831 lines)
│   └── [static assets]
├── dist/                         Compiled JavaScript
├── tsconfig.json
├── package.json
└── README_FORMGEAR_V2.md         Comprehensive documentation
```

### API Endpoints

**Forms:**
- `GET /api/forms` — List all forms
- `POST /api/forms` — Create form
- `GET /api/forms/:id` — Get form
- `PUT /api/forms/:id` — Update form
- `DELETE /api/forms/:id` — Delete form
- `GET /api/forms/search/:q` — Search forms
- `POST /api/forms/:id/submit` — Submit form

**AI:**
- `POST /api/ai/generate` — Generate code via AI
- `POST /api/ai/keys/save` — Save API keys to Firebase
- `GET /api/ai/keys/load` — Load keys from Firebase
- `POST /api/ai/test` — Test provider
- `GET /api/ai/providers` — List providers

### CSS Color Variables

```css
--bg-primary:      #0b1120 (dark navy)
--bg-secondary:    #1e293b (slate)
--bg-tertiary:     #0f172a (darker navy)
--card-bg:         #1e293b
--border-color:    #334155
--text-main:       #f1f5f9
--text-muted:      #cbd5e1
--accent-blue:     #3b82f6
--accent-green:    #10b981
--accent-orange:   #f59e0b
--accent-red:      #ef4444
--accent-purple:   #a855f7
```

---

<div align="center">

Saka Tracker v5.8.0 &middot; Alat bantu internal monitoring SE2026  
FormGear Pro removed — replaced by SurveyJS fullstack scaffold in /surveyjs-app

</div>
