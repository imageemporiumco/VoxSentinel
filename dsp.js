const fs = require('fs');

/**
 * VoiceGuard Modular DSP & Heuristic Feature Extraction Engine
 * Provides genuine signal processing calculations for WAV files.
 */

// Simple Radix-2 FFT implementation
function fft(re, im) {
    const n = re.length;
    if ((n & (n - 1)) !== 0) {
        throw new Error("FFT size must be a power of 2");
    }

    // Bit reversal permutation
    let limit = 1;
    let bit = n >> 1;
    while (bit > 0) {
        limit <<= 1;
        bit >>= 1;
    }

    for (let i = 0; i < n; i++) {
        let j = 0;
        let temp = i;
        let mask = n >> 1;
        while (mask > 0) {
            if ((temp & 1) !== 0) {
                j |= mask;
            }
            temp >>= 1;
            mask >>= 1;
        }
        if (j > i) {
            let t = re[i]; re[i] = re[j]; re[j] = t;
            t = im[i]; im[i] = im[j]; im[j] = t;
        }
    }

    // Cooley-Tukey decimation-in-time
    for (let len = 2; len <= n; len <<= 1) {
        const angle = -2 * Math.PI / len;
        const wlen_re = Math.cos(angle);
        const wlen_im = Math.sin(angle);
        for (let i = 0; i < n; i += len) {
            let w_re = 1;
            let w_im = 0;
            const half_len = len >> 1;
            for (let j = 0; j < half_len; j++) {
                const u_re = re[i + j];
                const u_im = im[i + j];
                const k = i + j + half_len;
                const v_re = re[k] * w_re - im[k] * w_im;
                const v_im = re[k] * w_im + im[k] * w_re;
                re[i + j] = u_re + v_re;
                im[i + j] = u_im + v_im;
                re[k] = u_re - v_re;
                im[k] = u_im - v_im;
                
                const next_w_re = w_re * wlen_re - w_im * wlen_im;
                const next_w_im = w_re * wlen_im + w_im * wlen_re;
                w_re = next_w_re;
                w_im = next_w_im;
            }
        }
    }
}

/**
 * Parse a standard WAV buffer.
 * Returns { sampleRate, channels, bitDepth, samples }
 */
function parseWav(buffer) {
    if (buffer.length < 44) {
        throw new Error("WAV file is too short");
    }

    // Check RIFF header
    const riff = buffer.toString('ascii', 0, 4);
    const wave = buffer.toString('ascii', 8, 12);
    if (riff !== 'RIFF' || wave !== 'WAVE') {
        throw new Error("Invalid WAV file container");
    }

    // Find format and data chunks
    let pos = 12;
    let format = null;
    let channels = null;
    let sampleRate = null;
    let byteRate = null;
    let blockAlign = null;
    let bitDepth = null;
    let audioFormat = null;
    let samples = null;

    while (pos < buffer.length - 8) {
        const subchunkId = buffer.toString('ascii', pos, pos + 4);
        const subchunkSize = buffer.readUInt32LE(pos + 4);
        pos += 8;

        if (subchunkId === 'fmt ') {
            audioFormat = buffer.readUInt16LE(pos);
            channels = buffer.readUInt16LE(pos + 2);
            sampleRate = buffer.readUInt32LE(pos + 4);
            byteRate = buffer.readUInt32LE(pos + 8);
            blockAlign = buffer.readUInt16LE(pos + 12);
            bitDepth = buffer.readUInt16LE(pos + 14);
        } else if (subchunkId === 'data') {
            const dataBytes = Math.min(subchunkSize, buffer.length - pos);
            samples = extractPcm(buffer, pos, dataBytes, channels, bitDepth);
            break; // Stop parsing after data chunk is loaded
        }
        pos += subchunkSize;
    }

    if (!sampleRate || !samples) {
        throw new Error("Could not find format or data chunk in WAV file");
    }

    return { sampleRate, channels, bitDepth, samples };
}

/**
 * Extract PCM samples into a Float32 array (mono).
 */
function extractPcm(buffer, start, length, channels, bitDepth) {
    let rawSamples = [];
    const bytesPerSample = bitDepth / 8;
    const totalSamples = Math.floor(length / bytesPerSample);
    
    // For simplicity, convert multi-channel to mono by averaging, or taking the first channel.
    // To speed up processing for large files, cap sample count to 2.4 million samples (approx. 50 seconds at 48kHz).
    const maxSamples = 2400000;
    const stride = channels;
    const step = bytesPerSample * stride;
    
    let readIndex = start;
    let count = 0;

    if (bitDepth === 16) {
        while (readIndex < start + length && count < maxSamples) {
            // Read 16-bit signed integer
            const val = buffer.readInt16LE(readIndex);
            rawSamples.push(val / 32768.0);
            readIndex += step;
            count++;
        }
    } else if (bitDepth === 8) {
        while (readIndex < start + length && count < maxSamples) {
            // Read 8-bit unsigned integer (offset binary)
            const val = buffer.readUInt8(readIndex);
            rawSamples.push((val - 128) / 128.0);
            readIndex += step;
            count++;
        }
    } else if (bitDepth === 24) {
        while (readIndex < start + length && count < maxSamples) {
            // Read 24-bit signed integer manually
            let val = (buffer.readUInt8(readIndex) | 
                       (buffer.readUInt8(readIndex + 1) << 8) | 
                       (buffer.readInt8(readIndex + 2) << 16));
            rawSamples.push(val / 8388608.0);
            readIndex += step;
            count++;
        }
    } else if (bitDepth === 32) {
        while (readIndex < start + length && count < maxSamples) {
            const val = buffer.readFloatLE(readIndex);
            rawSamples.push(val);
            readIndex += step;
            count++;
        }
    } else {
        throw new Error(`Unsupported bit depth: ${bitDepth}`);
    }

    return Float32Array.from(rawSamples);
}

/**
 * Extract audio features from a raw float buffer.
 */
function extractFeatures(samples, sampleRate) {
    const duration = samples.length / sampleRate;
    
    // Framing configuration
    const frameSize = 1024;
    const hopSize = 512;
    const numFrames = Math.floor((samples.length - frameSize) / hopSize) + 1;

    if (numFrames <= 0) {
        throw new Error("Audio is too short for DSP analysis. Need at least 25ms.");
    }

    const frameCentroids = [];
    const frameBandwidths = [];
    const frameRolloffs = [];
    const framePitches = [];
    const frameRMS = [];
    const frameZCR = [];
    const frameFlatness = [];

    // Pre-calculate Hanning window
    const window = new Float32Array(frameSize);
    for (let i = 0; i < frameSize; i++) {
        window[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (frameSize - 1)));
    }

    let clippingCount = 0;
    
    for (let f = 0; f < numFrames; f++) {
        const start = f * hopSize;
        const frameSamples = samples.slice(start, start + frameSize);

        // Calculate RMS
        let sumSq = 0;
        let zcr = 0;
        for (let i = 0; i < frameSamples.length; i++) {
            const val = frameSamples[i];
            sumSq += val * val;
            
            // Check clipping (amplitude >= 0.98)
            if (Math.abs(val) >= 0.98) {
                clippingCount++;
            }

            // Zero-Crossing Rate
            if (i > 0) {
                const prev = frameSamples[i - 1];
                if ((prev >= 0 && val < 0) || (prev < 0 && val >= 0)) {
                    zcr++;
                }
            }
        }
        const rms = Math.sqrt(sumSq / frameSamples.length);
        frameRMS.push(rms);
        frameZCR.push(zcr / frameSamples.length);

        // Pitch Tracking (Autocorrelation)
        // Focus range: 50Hz to 450Hz
        const minLag = Math.floor(sampleRate / 450);
        const maxLag = Math.floor(sampleRate / 50);
        let bestLag = -1;
        let maxCorr = -Infinity;

        // Perform autocorrelation on frame
        const corr = new Float32Array(maxLag + 1);
        for (let lag = minLag; lag <= maxLag; lag++) {
            let sum = 0;
            for (let i = 0; i < frameSamples.length - lag; i++) {
                sum += frameSamples[i] * frameSamples[i + lag];
            }
            corr[lag] = sum;
            if (sum > maxCorr) {
                maxCorr = sum;
                bestLag = lag;
            }
        }

        // Refined autocorrelation pitch thresholding
        let pitch = 0;
        if (bestLag !== -1 && rms > 0.015) {
            // Check if correlation peak is strong enough to represent voicing
            const energy = sumSq;
            const normalizedCorr = maxCorr / energy;
            if (normalizedCorr > 0.35) {
                pitch = sampleRate / bestLag;
            }
        }
        framePitches.push(pitch);

        // Frequency features (FFT)
        const re = new Float32Array(frameSize);
        const im = new Float32Array(frameSize);
        for (let i = 0; i < frameSize; i++) {
            re[i] = frameSamples[i] * window[i];
            im[i] = 0;
        }

        fft(re, im);

        // Compute magnitude spectrum (first half)
        const half = frameSize / 2;
        const magnitudes = new Float32Array(half);
        let totalMag = 0;
        for (let i = 0; i < half; i++) {
            magnitudes[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
            totalMag += magnitudes[i];
        }

        // Spectral Flatness (Wiener Entropy)
        let sumLn = 0;
        let sumMag = 0;
        for (let i = 0; i < half; i++) {
            const m = magnitudes[i] + 0.0001; // tiny offset to avoid log(0)
            sumLn += Math.log(m);
            sumMag += m;
        }
        const geomMean = Math.exp(sumLn / half);
        const arithMean = sumMag / half;
        const flatness = arithMean > 0 ? geomMean / arithMean : 0;
        frameFlatness.push(flatness);

        // Spectral Centroid and Bandwidth
        let centroid = 0;
        let bandwidth = 0;
        if (totalMag > 0.0001) {
            let weightedSum = 0;
            for (let i = 0; i < half; i++) {
                const freq = (i * sampleRate) / frameSize;
                weightedSum += freq * magnitudes[i];
            }
            centroid = weightedSum / totalMag;

            let diffSum = 0;
            for (let i = 0; i < half; i++) {
                const freq = (i * sampleRate) / frameSize;
                diffSum += Math.pow(freq - centroid, 2) * magnitudes[i];
            }
            bandwidth = Math.sqrt(diffSum / totalMag);
        }
        frameCentroids.push(centroid);
        frameBandwidths.push(bandwidth);

        // Spectral Rolloff (85% energy)
        let rolloff = 0;
        if (totalMag > 0.0001) {
            let cumulative = 0;
            const target = 0.85 * totalMag;
            for (let i = 0; i < half; i++) {
                cumulative += magnitudes[i];
                if (cumulative >= target) {
                    rolloff = (i * sampleRate) / frameSize;
                    break;
                }
            }
        }
        frameRolloffs.push(rolloff);
    }

    // Voice Activity Detection (VAD)
    // Filter active speech segments
    const rmsThreshold = 0.015;
    const speechIndices = [];
    for (let i = 0; i < numFrames; i++) {
        if (frameRMS[i] > rmsThreshold) {
            speechIndices.push(i);
        }
    }
    const speechPercentage = (speechIndices.length / numFrames) * 100;

    // Filter pitch and spectral values for speech-only regions
    const speechPitches = speechIndices.map(i => framePitches[i]).filter(p => p > 0);
    const speechCentroids = speechIndices.map(i => frameCentroids[i]);
    const speechBandwidths = speechIndices.map(i => frameBandwidths[i]);
    const speechRolloffs = speechIndices.map(i => frameRolloffs[i]);
    const speechZCR = speechIndices.map(i => frameZCR[i]);
    const speechFlatness = speechIndices.map(i => frameFlatness[i]);

    // Calculate statistical features
    const avgRMS = frameRMS.reduce((a, b) => a + b, 0) / numFrames;
    const peakRMS = Math.max(...frameRMS);
    const clippingPercentage = (clippingCount / samples.length) * 100;

    // Median filter / standard statistics
    const median = arr => {
        if (arr.length === 0) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };
    
    const stdDev = (arr, mean) => {
        if (arr.length === 0) return 0;
        const sqDiff = arr.map(v => Math.pow(v - mean, 2));
        return Math.sqrt(sqDiff.reduce((a, b) => a + b, 0) / arr.length);
    };

    const avgPitch = speechPitches.length > 0 ? speechPitches.reduce((a, b) => a + b, 0) / speechPitches.length : 0;
    const pitchStd = speechPitches.length > 0 ? stdDev(speechPitches, avgPitch) : 0;

    const avgCentroid = speechCentroids.length > 0 ? speechCentroids.reduce((a, b) => a + b, 0) / speechCentroids.length : 0;
    const avgBandwidth = speechBandwidths.length > 0 ? speechBandwidths.reduce((a, b) => a + b, 0) / speechBandwidths.length : 0;
    const avgRolloff = speechRolloffs.length > 0 ? speechRolloffs.reduce((a, b) => a + b, 0) / speechRolloffs.length : 0;
    const avgZCR = speechZCR.length > 0 ? speechZCR.reduce((a, b) => a + b, 0) / speechZCR.length : 0;
    const avgFlatness = speechFlatness.length > 0 ? speechFlatness.reduce((a, b) => a + b, 0) / speechFlatness.length : 0;

    // Jitter (local frequency variation)
    let jitter = 0;
    if (speechPitches.length > 1) {
        let diffSum = 0;
        for (let i = 0; i < speechPitches.length - 1; i++) {
            diffSum += Math.abs(speechPitches[i] - speechPitches[i + 1]);
        }
        jitter = diffSum / (speechPitches.length - 1) / Math.max(avgPitch, 1.0);
    }

    // Shimmer (local amplitude variation)
    let shimmer = 0;
    const speechRMS = speechIndices.map(i => frameRMS[i]);
    if (speechRMS.length > 1) {
        let diffSum = 0;
        for (let i = 0; i < speechRMS.length - 1; i++) {
            diffSum += Math.abs(speechRMS[i] - speechRMS[i + 1]);
        }
        const avgSpeechRMS = speechRMS.reduce((a, b) => a + b, 0) / speechRMS.length;
        shimmer = diffSum / (speechRMS.length - 1) / Math.max(avgSpeechRMS, 0.0001);
    }

    // Estimate Signal-to-Noise Ratio (SNR)
    const silenceRMS = [];
    for (let i = 0; i < numFrames; i++) {
        if (frameRMS[i] <= rmsThreshold) {
            silenceRMS.push(frameRMS[i]);
        }
    }
    let estimatedSNR = 35; // Default healthy dB
    if (silenceRMS.length > 0 && speechIndices.length > 0) {
        const avgSilenceRMS = silenceRMS.reduce((a, b) => a + b, 0) / silenceRMS.length;
        const avgSpeechRMS = speechIndices.reduce((sum, idx) => sum + frameRMS[idx], 0) / speechIndices.length;
        if (avgSilenceRMS > 0.0001) {
            estimatedSNR = 20 * Math.log10(avgSpeechRMS / Math.max(avgSilenceRMS, 0.0001));
        }
    }
    estimatedSNR = Math.max(0, Math.min(60, estimatedSNR));

    return {
        duration,
        sampleRate,
        avgRMS,
        peakRMS,
        clippingPercentage,
        speechPercentage,
        estimatedSNR,
        avgPitch,
        pitchStd,
        avgCentroid,
        avgBandwidth,
        avgRolloff,
        avgZCR,
        jitter,
        shimmer,
        avgFlatness,
        pitches: framePitches,
        rms: frameRMS,
        centroids: frameCentroids,
        rolloffs: frameRolloffs,
        zcr: frameZCR,
        numFrames,
        frameSize,
        hopSize
    };
}

/**
 * Runs the detection logic based on the extracted features.
 * Distinguishes between HUMAN, LIKELY HUMAN, SUSPICIOUS, LIKELY AI-GENERATED, AI-GENERATED/SYNTHETIC, INCONCLUSIVE
 */
function analyzeDetection(features) {
    const {
        duration,
        estimatedSNR,
        speechPercentage,
        pitchStd,
        avgPitch,
        avgCentroid,
        avgRolloff,
        clippingPercentage,
        avgZCR,
        jitter,
        shimmer,
        avgFlatness
    } = features;

    // Check Quality assessment
    const reasonsForInconclusive = [];
    if (duration < 1.5) {
        reasonsForInconclusive.push("Audio duration too short (minimum 1.5s required)");
    }
    if (estimatedSNR < 10) {
        reasonsForInconclusive.push("Excessive noise (SNR < 10dB)");
    }
    if (speechPercentage < 15) {
        reasonsForInconclusive.push("Insufficient speech activity detected");
    }

    if (reasonsForInconclusive.length > 0) {
        return {
            classification: "INCONCLUSIVE",
            authenticityScore: 50,
            confidence: "LOW",
            reasons: reasonsForInconclusive,
            quality: "POOR",
            indicators: getInconclusiveIndicators(features)
        };
    }

    let score = 90; // Start with healthy human baseline
    const deductions = [];
    const suspicions = [];
    const supports = [];

    // 1. Pitch Naturalness / Prosody
    if (pitchStd < 5) {
        score -= 25;
        deductions.push({ feature: "Prosodic Variation", value: pitchStd.toFixed(1) + " Hz", weight: 25, reason: "Pitch variance is extremely flat" });
        suspicions.push("Unusually robotic, monotonic pitch envelope (low F0 variance)");
    } else if (pitchStd < 10) {
        score -= 12;
        deductions.push({ feature: "Prosodic Variation", value: pitchStd.toFixed(1) + " Hz", weight: 12, reason: "Pitch variance is moderately constrained" });
        suspicions.push("Constrained pitch variation suggests synthetic prosody styling");
    } else if (pitchStd > 65) {
        score -= 8;
        deductions.push({ feature: "Prosodic Variation", value: pitchStd.toFixed(1) + " Hz", weight: 8, reason: "Unnatural frequency swings" });
        suspicions.push("Unnatural F0 tracking jumps or frequency synthesis shifts");
    } else {
        supports.push("Natural voice pitch dynamics and prosodic frequency variations");
    }

    // 2. Micro-Frequency Jitter
    if (avgPitch > 0) {
        if (jitter < 0.005) { // < 0.5%
            score -= 15;
            deductions.push({ feature: "Micro-frequency Jitter", value: (jitter * 100).toFixed(2) + "%", weight: 15, reason: "Larynx micro-fluctuations are abnormally low (vocoder phase-lock)" });
            suspicions.push("Extremely flat micro-frequency variance (low jitter) indicates artificial clock-locked voice generation");
        } else if (jitter > 0.08) { // > 8%
            score -= 5;
            deductions.push({ feature: "Micro-frequency Jitter", value: (jitter * 100).toFixed(2) + "%", weight: 5, reason: "Excessive pitch jitter" });
            suspicions.push("Erratic pitch jitter suggests speech tracking glitches or vocoder alignment errors");
        } else {
            supports.push(`Natural larynx micro-frequency variation (jitter: ${(jitter * 100).toFixed(2)}%)`);
        }
    }

    // 3. Micro-Amplitude Shimmer
    if (avgPitch > 0) {
        if (shimmer < 0.018) { // < 1.8%
            score -= 12;
            deductions.push({ feature: "Micro-amplitude Shimmer", value: (shimmer * 100).toFixed(2) + "%", weight: 12, reason: "Amplitude fluctuations are abnormally flat (level lock)" });
            suspicions.push("Unnaturally flat amplitude frames (low shimmer) typical of vocoder engines");
        } else {
            supports.push(`Healthy conversational amplitude variance (shimmer: ${(shimmer * 100).toFixed(2)}%)`);
        }
    }

    // 4. Spectral Flatness (Wiener Entropy)
    if (avgFlatness > 0.45) {
        score -= 8;
        deductions.push({ feature: "Spectral Flatness", value: avgFlatness.toFixed(3), weight: 8, reason: "Unusually high noise ratio" });
        suspicions.push("High average spectral flatness indicates buzzy or muffled synthesis noise");
    }

    // 5. High Frequency Cut-off (Spectral Rolloff & Centroid)
    if (avgRolloff < 6500) {
        score -= 22;
        deductions.push({ feature: "Spectral Consistency", value: avgRolloff.toFixed(0) + " Hz", weight: 22, reason: "Heavy brickwall filtering detected below 6.5kHz" });
        suspicions.push("Extremely narrow spectral footprint indicating standard voice synthesis downsampling");
    } else if (avgRolloff < 9000) {
        score -= 12;
        deductions.push({ feature: "Spectral Consistency", value: avgRolloff.toFixed(0) + " Hz", weight: 12, reason: "Spectral rolloff cut-off typical of 16kHz vocoder sampling" });
        suspicions.push("Spectral rolloff cut-off matches signature frequency limits of 16kHz speech models");
    } else if (avgRolloff > 15000 && clippingPercentage > 2.0) {
        score -= 10;
        deductions.push({ feature: "Signal Artifacts", value: clippingPercentage.toFixed(1) + "%", weight: 10, reason: "High-frequency clipping anomalies detected" });
        suspicions.push("Acoustic distortion or synthetic processing artifacts");
    } else {
        supports.push("Wide, natural frequency band distribution without sharp digital filter cuts");
    }

    // 6. Spectral Centroid
    if (avgCentroid < 1200) {
        score -= 8;
        deductions.push({ feature: "Harmonic Structure", value: avgCentroid.toFixed(0) + " Hz", weight: 8, reason: "Spectral centroid is abnormally low" });
        suspicions.push("Muffled timbral structure or vocoder phase distortion");
    } else {
        supports.push("Expected timbral variability in spectral centroids");
    }

    // 7. Temporal Dynamics
    if (avgZCR < 0.05) {
        score -= 5;
        deductions.push({ feature: "Temporal Dynamics", value: avgZCR.toFixed(3), weight: 5, reason: "Abnormally low zero-crossing rate" });
        suspicions.push("Unnatural voiceless-to-voiced energy transitions");
    } else {
        supports.push("Standard temporal transitions and noise envelopes");
    }

    if (clippingPercentage > 3) {
        score -= 5;
        suspicions.push("Flipped frames or clipping amplitude points");
    }

    // Bound authenticity score to 0 - 100
    score = Math.max(0, Math.min(100, Math.round(score)));

    // Categorization
    let classification = "HUMAN";
    if (score >= 85) classification = "HUMAN";
    else if (score >= 70) classification = "LIKELY HUMAN";
    else if (score >= 50) classification = "SUSPICIOUS";
    else if (score >= 30) classification = "LIKELY AI-GENERATED";
    else classification = "AI-GENERATED / SYNTHETIC";

    // Confidence mapping
    let confidence = "HIGH";
    if (estimatedSNR < 18 || duration < 3.0) confidence = "MEDIUM";
    if (estimatedSNR < 13 && duration < 2.0) confidence = "LOW";

    // Explanatory sentence
    let explanation = "";
    if (classification === "HUMAN") {
        explanation = "The analyzed recording contains characteristics that strongly resemble natural human speech dynamics. No digital vocoder filters, phase anomalies, or robotic prosody locks were detected.";
    } else if (classification === "LIKELY HUMAN") {
        explanation = "The audio contains mostly natural human voice patterns. Minor spectral filtering or high compression was detected, which could slightly mask natural vocal details, but it does not represent synthetic synthesis.";
    } else if (classification === "SUSPICIOUS") {
        explanation = "Acoustic characteristics display moderate deviations from expected natural voice limits. Constrained pitch variation, flat jitter/shimmer coefficients, and narrow high-frequency profiles raise suspicion of cloning or vocoder adjustment.";
    } else if (classification === "LIKELY AI-GENERATED") {
        explanation = "Multiple acoustic indicators strongly match synthetic voice generation characteristics. In particular, the combination of flat prosody (low F0 variance), minimal micro-jitter/shimmer, and sharp spectral rolloff is characteristic of text-to-speech vocoders.";
    } else {
        explanation = "High-confidence digital signatures of synthetic speech have been identified. The audio displays a rigid, monotonic pitch track, flat micro-vibrations, and severe brickwall filtering, confirming synthetic vocoder synthesis.";
    }

    return {
        classification,
        authenticityScore: score,
        confidence,
        explanation,
        reasons: suspicions,
        supports: supports,
        quality: estimatedSNR > 25 ? "EXCELLENT" : (estimatedSNR > 15 ? "GOOD" : "FAIR"),
        deductions,
        indicators: calculateIndicators(features, score)
    };
}

function calculateIndicators(features, overallScore) {
    const { pitchStd, avgRolloff, avgCentroid, clippingPercentage, estimatedSNR, jitter, shimmer } = features;

    // Helper to map values to an indicator score (0-100)
    // For indicators, 100 means fully natural/human, 0 means fully artificial.

    // Spectral Consistency
    let spectralScore = 95;
    if (avgRolloff < 7500) spectralScore = 30;
    else if (avgRolloff < 9000) spectralScore = 60;
    else if (avgRolloff < 11000) spectralScore = 80;

    // Prosodic Variation
    let prosodyScore = 95;
    if (pitchStd < 6) prosodyScore = 20;
    else if (pitchStd < 11) prosodyScore = 55;
    else if (pitchStd < 15) prosodyScore = 80;
    else if (pitchStd > 60) prosodyScore = 70; // overly erratic

    // Decrease prosody indicator score if micro-frequency variation is flat (low jitter)
    if (features.avgPitch > 0 && jitter < 0.005) {
        prosodyScore = Math.min(prosodyScore, 30);
    }

    // Harmonic Structure
    let harmonicScore = 90;
    if (avgCentroid < 1200) harmonicScore = 50;
    else if (avgCentroid > 2500) harmonicScore = 75;

    // Temporal Dynamics
    let temporalScore = 92;
    if (features.avgZCR < 0.06) temporalScore = 60;

    // Background Environment
    let bgScore = Math.max(10, Math.min(100, Math.round(estimatedSNR * 1.6)));

    // Signal Artifacts
    let artifactScore = 100 - Math.min(60, Math.round(clippingPercentage * 12));
    if (avgRolloff < 7000) artifactScore -= 20; // brickwall filter is an artifact
    
    // Decrease artifact indicator score if amplitude variation is flat (low shimmer)
    if (features.avgPitch > 0 && shimmer < 0.018) {
        artifactScore = Math.min(artifactScore, 40);
    }
    artifactScore = Math.max(10, artifactScore);

    return [
        {
            name: "Spectral Consistency",
            score: spectralScore,
            status: getStatus(spectralScore),
            explanation: `Spectral rolloff boundary lies at ${avgRolloff.toFixed(0)} Hz. ${spectralScore < 70 ? 'Indicates vocoder sampling cutoff.' : 'Shows healthy harmonic expansion.'}`,
            importance: "HIGH"
        },
        {
            name: "Prosodic Variation",
            score: prosodyScore,
            status: getStatus(prosodyScore),
            explanation: `Pitch deviation is ${pitchStd.toFixed(1)} Hz. ${prosodyScore < 70 ? 'Speech lacks natural melodic fluctuation (prosodic lock).' : 'Contains human-like conversational pitch shifts.'}`,
            importance: "HIGH"
        },
        {
            name: "Harmonic Structure",
            score: harmonicScore,
            status: getStatus(harmonicScore),
            explanation: `Average spectral centroid is ${avgCentroid.toFixed(0)} Hz. ${harmonicScore < 75 ? 'Vowel formats show slight compression damping.' : 'Strong, defined vocal tract resonances detected.'}`,
            importance: "MEDIUM"
        },
        {
            name: "Temporal Dynamics",
            score: temporalScore,
            status: getStatus(temporalScore),
            explanation: `Vocal energy boundaries conform to standard temporal envelopes. Zero-crossing rate is stable at ${features.avgZCR.toFixed(3)}.`,
            importance: "MEDIUM"
        },
        {
            name: "Background Environment",
            score: bgScore,
            status: getStatus(bgScore),
            explanation: `Signal-to-noise ratio is estimated at ${estimatedSNR.toFixed(1)} dB. ${bgScore < 60 ? 'Noisy background reduces detection accuracy.' : 'Clean background enables precise acoustic validation.'}`,
            importance: "LOW"
        },
        {
            name: "Signal Artifacts",
            score: artifactScore,
            status: getStatus(artifactScore),
            explanation: `${artifactScore < 70 ? 'Vocoder filter patterns or phase errors detected.' : 'No synthesis clicks, brickwall filters, or framing errors found.'}`,
            importance: "HIGH"
        }
    ];
}

function getInconclusiveIndicators(features) {
    return [
        { name: "Spectral Consistency", score: 50, status: "INCONCLUSIVE", explanation: "Audio details insufficient to measure frequency limits.", importance: "HIGH" },
        { name: "Prosodic Variation", score: 50, status: "INCONCLUSIVE", explanation: "Pitch tracking requires longer speech sections.", importance: "HIGH" },
        { name: "Harmonic Structure", score: 50, status: "INCONCLUSIVE", explanation: "Resonance indicators are highly muffled.", importance: "MEDIUM" },
        { name: "Temporal Dynamics", score: 50, status: "INCONCLUSIVE", explanation: "Inconclusive timing metrics.", importance: "MEDIUM" },
        { name: "Background Environment", score: 30, status: "WARNING", explanation: `Estimated SNR: ${features.estimatedSNR ? features.estimatedSNR.toFixed(1) : 'unknown'} dB. High noise floor masking signal.`, importance: "LOW" },
        { name: "Signal Artifacts", score: 50, status: "INCONCLUSIVE", explanation: "High noise floor makes artifacts indistinguishable.", importance: "HIGH" }
    ];
}

function getStatus(val) {
    if (val >= 80) return "SAFE";
    if (val >= 60) return "WARNING";
    return "CRITICAL";
}

/**
 * Compare two sets of features for Speaker Similarity (Impersonation Mode)
 */
function compareFeatures(refFeatures, testFeatures) {
    // Timbre similarity based on Spectral Centroid and Bandwidth ratios
    const centroidRatio = Math.min(refFeatures.avgCentroid, testFeatures.avgCentroid) / Math.max(refFeatures.avgCentroid, testFeatures.avgCentroid);
    const bandwidthRatio = Math.min(refFeatures.avgBandwidth, testFeatures.avgBandwidth) / Math.max(refFeatures.avgBandwidth, testFeatures.avgBandwidth);
    
    // Pitch similarities
    let pitchSimilarity = 1.0;
    if (refFeatures.avgPitch > 0 && testFeatures.avgPitch > 0) {
        pitchSimilarity = Math.min(refFeatures.avgPitch, testFeatures.avgPitch) / Math.max(refFeatures.avgPitch, testFeatures.avgPitch);
    } else if ((refFeatures.avgPitch === 0 && testFeatures.avgPitch > 0) || (refFeatures.avgPitch > 0 && testFeatures.avgPitch === 0)) {
        pitchSimilarity = 0.4; // One is silent, one is voiced
    }

    const pitchStdRatio = Math.min(refFeatures.pitchStd, testFeatures.pitchStd) / Math.max(Math.max(refFeatures.pitchStd, testFeatures.pitchStd), 1.0);

    // Dynamic range overlap
    const zcrRatio = Math.min(refFeatures.avgZCR, testFeatures.avgZCR) / Math.max(refFeatures.avgZCR, testFeatures.avgZCR);

    // Weighted similarity calculation
    const similarity = (
        (pitchSimilarity * 0.35) + 
        (pitchStdRatio * 0.15) + 
        (centroidRatio * 0.25) + 
        (bandwidthRatio * 0.15) + 
        (zcrRatio * 0.10)
    ) * 100;

    return {
        speakerSimilarity: Math.max(0, Math.min(100, Math.round(similarity))),
        pitchSimilarity: Math.round(pitchSimilarity * 100),
        timbreSimilarity: Math.round(((centroidRatio + bandwidthRatio) / 2) * 100),
        envelopeSimilarity: Math.round(zcrRatio * 100)
    };
}

module.exports = {
    parseWav,
    extractFeatures,
    analyzeDetection,
    compareFeatures
};
