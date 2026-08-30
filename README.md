# VoxSentinel 🛡️🎙️
> **Advanced Voice-Cloning & Impersonation Detection Platform**

[![Deploy to GitHub Pages](https://github.com/imageemporiumco/VoxSentinel/actions/workflows/deploy.yml/badge.svg)](https://github.com/imageemporiumco/VoxSentinel/actions/workflows/deploy.yml)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-brightgreen)](https://imageemporiumco.github.io/VoxSentinel/)

VoxSentinel is an in-browser real-time audio forensic analysis and synthetic voice detection platform designed to identify AI voice cloning, deepfakes, and vocoder artifacts with high precision.

---

## 🌐 Live Web App

Try the live application directly in your browser without installing anything:  
👉 **[https://imageemporiumco.github.io/VoxSentinel/](https://imageemporiumco.github.io/VoxSentinel/)**

All audio processing and DSP calculations execute locally in your browser using client-side Web Audio API and Web Workers (no audio is uploaded or stored externally).

---

## 🚀 Key Features

- **Genuine In-Browser Digital Signal Processing (DSP)**:
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
  - Interactive radar charts, spectral timelines, and local storage historical registry.
- **Mode B: Speaker Impersonation Comparison**:
  - Cross-compare reference speaker audio against a suspect sample.
  - Real-time timbre overlap and spectral distance scoring.
- **Flexible Deployment**:
  - Runs 100% serverless on **GitHub Pages**.
  - Optional full-stack deployment with Node.js/Express server.

---

## 🛠️ Tech Stack

- **Audio & DSP**: Web Audio API, Web Workers, Radix-2 FFT, Autocorrelation F0 pitch tracker, Spectral Flux & Centroid processors
- **Frontend**: Vanilla JavaScript (ES6+), HTML5 Canvas, Modern CSS Design System
- **Persistence**: LocalStorage with optional JSON database backend (`db.json`)
- **Backend (Optional)**: Node.js, Express.js, Multer

---

## 📦 Local Setup & Development

### Running with Local Node.js Server:

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

## 📄 License
MIT License
