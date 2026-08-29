/**
 * VoiceGuard Demo Data Profiles
 * High-fidelity pre-calculated DSP metrics for presentation demo mode.
 */

const VoiceGuardDemoData = {
    human: {
        id: "demo_human_01",
        filename: "presidential_keynote_master.wav",
        sizeBytes: 1088640,
        duration: 12.35,
        sampleRate: 44100,
        classification: "HUMAN",
        authenticityScore: 92,
        confidence: "HIGH",
        explanation: "The analyzed recording contains characteristics that strongly resemble natural human speech dynamics. No digital vocoder filters, phase anomalies, or robotic prosody locks were detected. Standard micro-vibrations and pitch variation (24.1 Hz) indicate typical biological speech production.",
        quality: "EXCELLENT",
        reasons: [],
        supports: [
            "Natural voice pitch variation (F0 std dev = 24.1 Hz)",
            "Wide spectral footprint up to 18.5kHz without sharp filter boundaries",
            "Smooth conversational pauses with organic ambient room tone",
            "Expected timbral variability in spectral centroids"
        ],
        deductions: [],
        indicators: [
            { name: "Spectral Consistency", score: 95, status: "SAFE", explanation: "Spectral rolloff boundary lies at 16,840 Hz. Shows healthy harmonic expansion.", importance: "HIGH" },
            { name: "Prosodic Variation", score: 94, status: "SAFE", explanation: "Pitch deviation is 24.1 Hz. Contains human-like conversational pitch shifts.", importance: "HIGH" },
            { name: "Harmonic Structure", score: 92, status: "SAFE", explanation: "Average spectral centroid is 1,652 Hz. Strong, defined vocal tract resonances.", importance: "MEDIUM" },
            { name: "Temporal Dynamics", score: 90, status: "SAFE", explanation: "Vocal energy boundaries conform to standard temporal envelopes. Zero-crossing rate is stable at 0.084.", importance: "MEDIUM" },
            { name: "Background Environment", score: 88, status: "SAFE", explanation: "Signal-to-noise ratio is estimated at 38.5 dB. Clean background enables precise acoustic validation.", importance: "LOW" },
            { name: "Signal Artifacts", score: 96, status: "SAFE", explanation: "No synthesis clicks, brickwall filters, or framing errors found.", importance: "HIGH" }
        ],
        metrics: {
            avgRMS: 0.084,
            peakRMS: 0.284,
            clippingPercentage: 0.0,
            speechPercentage: 84.5,
            estimatedSNR: 38.5,
            avgPitch: 184.2,
            pitchStd: 24.1,
            avgCentroid: 1652.4,
            avgBandwidth: 1450.2,
            avgRolloff: 16840.0,
            avgZCR: 0.084,
            jitter: 0.0125,
            shimmer: 0.0450,
            avgFlatness: 0.125
        },
        // Downsampled arrays for charts
        pitches: Array.from({length: 100}, (_, i) => 180 + Math.sin(i / 5) * 20 + Math.cos(i / 2) * 10 + (Math.random() - 0.5) * 5),
        rms: Array.from({length: 100}, (_, i) => {
            const base = Math.sin(i / 15) > 0.2 ? 0.08 : 0.01;
            return Math.max(0.005, base + (Math.random() - 0.5) * 0.03);
        }),
        centroids: Array.from({length: 100}, (_, i) => 1500 + Math.sin(i / 4) * 300 + (Math.random() - 0.5) * 100),
        segments: [
            { index: 1, start: 0.0, end: 3.2, duration: 3.2, classification: "Human-like", confidence: 94 },
            { index: 2, start: 3.2, end: 4.1, duration: 0.9, classification: "Silence", confidence: 99 },
            { index: 3, start: 4.1, end: 8.5, duration: 4.4, classification: "Human-like", confidence: 91 },
            { index: 4, start: 8.5, end: 9.2, duration: 0.7, classification: "Silence", confidence: 99 },
            { index: 5, start: 9.2, end: 12.3, duration: 3.1, classification: "Human-like", confidence: 93 }
        ]
    },

    synthetic: {
        id: "demo_synthetic_01",
        filename: "cloned_voicemail_attack.wav",
        sizeBytes: 864320,
        duration: 9.80,
        sampleRate: 16000,
        classification: "AI-GENERATED / SYNTHETIC",
        authenticityScore: 16,
        confidence: "HIGH",
        explanation: "High-confidence digital signatures of synthetic speech have been identified. The audio displays a rigid, monotonic pitch track coupled with severe brickwall filtering at 7.8kHz (typical of 16kHz model vocoders) and phase synthesis artifacts, confirming cloned speech synthesis.",
        quality: "GOOD",
        reasons: [
            "Highly regular, flat pitch tracking (F0 std dev = 3.8 Hz)",
            "Sharp brickwall spectral cutoff at 7,850 Hz indicating 16kHz vocoder generator limit",
            "Lack of high frequency details above 8kHz",
            "Unnatural instantaneous silence boundaries (gating artifacts)"
        ],
        supports: [],
        deductions: [
            { feature: "Prosodic Variation", value: "3.8 Hz", weight: 25, reason: "Pitch variance is extremely flat (robotic/monotonic)" },
            { feature: "Spectral Consistency", value: "7850 Hz", weight: 22, reason: "Heavy brickwall filtering detected below 8.0kHz" },
            { feature: "Harmonic Structure", value: "1120 Hz", weight: 8, reason: "Spectral centroid is abnormally low (muffled/distorted timbre)" },
            { feature: "Signal Artifacts", value: "Phase error", weight: 20, reason: "Vocoder phase alignment pattern detected" }
        ],
        indicators: [
            { name: "Spectral Consistency", score: 18, status: "CRITICAL", explanation: "Spectral rolloff boundary lies at 7,850 Hz. Indicates 16kHz vocoder sampling cutoff.", importance: "HIGH" },
            { name: "Prosodic Variation", score: 14, status: "CRITICAL", explanation: "Pitch deviation is 3.8 Hz. Speech lacks natural melodic fluctuation (prosodic lock).", importance: "HIGH" },
            { name: "Harmonic Structure", score: 45, status: "WARNING", explanation: "Average spectral centroid is 1,120 Hz. Vocal formats show heavy resonance compression.", importance: "MEDIUM" },
            { name: "Temporal Dynamics", score: 55, status: "WARNING", explanation: "Silence gating is instantaneous; lacks natural acoustic decay envelopes.", importance: "MEDIUM" },
            { name: "Background Environment", score: 92, status: "SAFE", explanation: "Signal-to-noise ratio is estimated at 42.0 dB. Exceptionally clean, synthetic silence.", importance: "LOW" },
            { name: "Signal Artifacts", score: 12, status: "CRITICAL", explanation: "Severe brickwall filtering and vocoder phase error signatures detected.", importance: "HIGH" }
        ],
        metrics: {
            avgRMS: 0.092,
            peakRMS: 0.220,
            clippingPercentage: 0.0,
            speechPercentage: 92.1,
            estimatedSNR: 42.0,
            avgPitch: 154.2,
            pitchStd: 3.8,
            avgCentroid: 1120.4,
            avgBandwidth: 950.6,
            avgRolloff: 7850.0,
            avgZCR: 0.042,
            jitter: 0.0018,
            shimmer: 0.0075,
            avgFlatness: 0.540
        },
        pitches: Array.from({length: 100}, (_, i) => {
            // Very flat pitch
            if (i > 10 && i < 40) return 154.0 + Math.sin(i / 10) * 0.8;
            if (i >= 40 && i < 45) return 0; // silence
            if (i >= 45 && i < 90) return 153.8 + Math.cos(i / 12) * 0.7;
            return 0;
        }),
        rms: Array.from({length: 100}, (_, i) => {
            // Sharp on/off silence gating
            if (i > 10 && i < 40) return 0.09 + (Math.random() - 0.5) * 0.01;
            if (i >= 40 && i < 45) return 0.0001; // perfectly silent
            if (i >= 45 && i < 90) return 0.095 + (Math.random() - 0.5) * 0.01;
            return 0.0001;
        }),
        centroids: Array.from({length: 100}, (_, i) => {
            if (i > 10 && i < 40) return 1100 + Math.sin(i / 10) * 50;
            if (i >= 40 && i < 45) return 0;
            if (i >= 45 && i < 90) return 1140 + Math.cos(i / 10) * 50;
            return 0;
        }),
        segments: [
            { index: 1, start: 0.0, end: 1.0, duration: 1.0, classification: "Silence", confidence: 99 },
            { index: 2, start: 1.0, end: 4.0, duration: 3.0, classification: "AI-Generated", confidence: 92 },
            { index: 3, start: 4.0, end: 4.5, duration: 0.5, classification: "Silence", confidence: 99 },
            { index: 4, start: 4.5, end: 9.0, duration: 4.5, classification: "AI-Generated", confidence: 96 },
            { index: 5, start: 9.0, end: 9.8, duration: 0.8, classification: "Silence", confidence: 99 }
        ]
    },

    suspicious: {
        id: "demo_suspicious_01",
        filename: "whatsapp_voice_forward.mp3",
        sizeBytes: 312500,
        duration: 6.50,
        sampleRate: 24000,
        classification: "SUSPICIOUS",
        authenticityScore: 54,
        confidence: "MEDIUM",
        explanation: "Acoustic characteristics display moderate deviations from expected natural voice limits. Pitch variance (8.6 Hz) is constrained, and a sharp rolloff cutoff is detected at 11,800 Hz. Compression artifacts from social forwarding obscure high frequency signals, reducing overall confidence.",
        quality: "FAIR",
        reasons: [
            "Moderately flat pitch variation (F0 std dev = 8.6 Hz)",
            "Acoustic rolloff matches signature limits of 24kHz audio synthesis engines",
            "High social-media compression artifacts (WhatsApp/Telegram codecs)"
        ],
        supports: [
            "Slight organic variance in speech volume (RMS fluctuation)"
        ],
        deductions: [
            { feature: "Prosodic Variation", value: "8.6 Hz", weight: 12, reason: "Pitch variance is moderately constrained" },
            { feature: "Spectral Consistency", value: "11800 Hz", weight: 12, reason: "Spectral rolloff matches 24kHz synthesis limits" },
            { feature: "Compression Artifacts", value: "MP3/Opus", weight: 10, reason: "Forwarding compression masks high frequencies" }
        ],
        indicators: [
            { name: "Spectral Consistency", score: 62, status: "WARNING", explanation: "Spectral rolloff boundary lies at 11,800 Hz. Matches typical 24kHz model codec.", importance: "HIGH" },
            { name: "Prosodic Variation", score: 58, status: "WARNING", explanation: "Pitch deviation is 8.6 Hz. Suggests semi-automated speech synthesis.", importance: "HIGH" },
            { name: "Harmonic Structure", score: 68, status: "WARNING", explanation: "Average spectral centroid is 1,320 Hz. Resonances are partially compressed.", importance: "MEDIUM" },
            { name: "Temporal Dynamics", score: 72, status: "SAFE", explanation: "Vocal energy transitions are generally natural with minor gating anomalies.", importance: "MEDIUM" },
            { name: "Background Environment", score: 58, status: "WARNING", explanation: "Signal-to-noise ratio is estimated at 19.5 dB. Compression noise is present.", importance: "LOW" },
            { name: "Signal Artifacts", score: 52, status: "WARNING", explanation: "Compression artifacts and potential synthesis vocoder features identified.", importance: "HIGH" }
        ],
        metrics: {
            avgRMS: 0.065,
            peakRMS: 0.195,
            clippingPercentage: 0.4,
            speechPercentage: 78.0,
            estimatedSNR: 19.5,
            avgPitch: 210.5,
            pitchStd: 8.6,
            avgCentroid: 1320.0,
            avgBandwidth: 1120.4,
            avgRolloff: 11800.0,
            avgZCR: 0.062,
            jitter: 0.0042,
            shimmer: 0.0145,
            avgFlatness: 0.320
        },
        pitches: Array.from({length: 100}, (_, i) => {
            if (i > 15 && i < 80) return 210.0 + Math.sin(i / 8) * 4.5;
            return 0;
        }),
        rms: Array.from({length: 100}, (_, i) => {
            if (i > 15 && i < 80) return 0.06 + Math.sin(i / 10) * 0.03 + (Math.random() - 0.5) * 0.01;
            return 0.005;
        }),
        centroids: Array.from({length: 100}, (_, i) => {
            if (i > 15 && i < 80) return 1300 + Math.sin(i / 5) * 150 + (Math.random() - 0.5) * 50;
            return 0;
        }),
        segments: [
            { index: 1, start: 0.0, end: 1.0, duration: 1.0, classification: "Silence", confidence: 95 },
            { index: 2, start: 1.0, end: 3.2, duration: 2.2, classification: "Human-like", confidence: 72 },
            { index: 3, start: 3.2, end: 5.2, duration: 2.0, classification: "Suspicious", confidence: 64 },
            { index: 4, start: 5.2, end: 6.5, duration: 1.3, classification: "Silence", confidence: 98 }
        ]
    }
};

// Expose to window/global scope if running in browser
if (typeof window !== 'undefined') {
    window.VoiceGuardDemoData = VoiceGuardDemoData;
} else if (typeof module !== 'undefined') {
    module.exports = VoiceGuardDemoData;
}
