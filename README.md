# VoxSentinel 🛡️🎙️
> **Advanced Voice-Cloning & Impersonation Detection Platform**

VoxSentinel is a real-time audio forensic analysis and synthetic voice detection engine designed to identify AI voice cloning, deepfakes, and vocoder artifacts with high precision.

---

## 🚀 Key Features

- **Genuine Digital Signal Processing (DSP)**:
  - Radix-2 Fast Fourier Transform (FFT) analysis.
  - Formant tracking (F1, F2, F3) & spectral centroid calculation.
  - Micro-frequency Pitch Jitter and Shimmer extraction.
  - Zero-crossing rate (ZCR), energy envelope variance, and spectral rolloff/flux metrics.
- **Forensic Scoring & Classification Engine**:
  - Heuristic authenticity scoring (0–100%) categorized into `GENUINE`, `SUSPICIOUS`, or `SYNTHETIC`.
  - Transparent deduction reasons and supportive acoustic proofs.
- **Interactive Web Dashboard**:
  - Live microphone recording with real-time waveform and spectrogram visualization.
  - Drag-and-drop audio file support (`.wav`, `.mp3`, `.ogg`, `.m4a`, `.webm`, `.aac`).
  - Interactive radar charts, spectral timelines, and historical analysis logs.
- **RESTful API**:
  - Easily integrate forensic analysis into automated pipelines and fraud prevention workflows.

---

## 🛠️ Tech Stack

- **Backend**: Node.js, Express.js, Multer
- **Audio & DSP**: Custom Radix-2 FFT, autocorrelation F0 pitch tracker, spectral flux & centroid processors
- **Frontend**: Vanilla JavaScript (ES6+), HTML5 Canvas, Web Audio API, Web Workers
- **Database**: Lightweight JSON persistence (`db.json`)

---

## 📦 Installation & Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (v16.x or higher)
- `npm` (v8.x or higher)

### Quickstart

1. **Clone the repository:**
   ```bash
   git clone git@github.com:imageemporiumco/VoxSentinel.git
   cd VoxSentinel
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the server:**
   ```bash
   npm start
   ```

4. **Access the application:**
   Open [http://localhost:8080](http://localhost:8080) in your browser.

---

## 🔌 API Endpoints

### 1. Analyze Audio
- **POST** `/api/analyze`
- **Content-Type**: `multipart/form-data` or `application/json`
- **Body**: Audio file or raw client-extracted audio features
- **Response**: Full forensic breakdown, classification, authenticity score, and confidence rating.

### 2. Analysis History
- **GET** `/api/history` — Retrieve previous scan records
- **DELETE** `/api/history/:id` — Delete a scan record
- **DELETE** `/api/history` — Clear all history records

---

## 📄 License
MIT License
