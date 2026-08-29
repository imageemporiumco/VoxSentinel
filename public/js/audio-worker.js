/**
 * VoiceGuard Audio Analysis Web Worker
 * Offloads heavy FFT, pitch tracking, and VAD processing from the main UI thread.
 */

// Simple Radix-2 FFT implementation in the worker
function fft(re, im) {
    const n = re.length;
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

self.onmessage = function (e) {
    const { action, samples, sampleRate } = e.data;

    if (action === "analyze") {
        try {
            // Signal normalization
            const normalizedSamples = normalize(samples);

            // Framing parameters
            const frameSize = 1024;
            const hopSize = 512;
            const numFrames = Math.floor((normalizedSamples.length - frameSize) / hopSize) + 1;

            if (numFrames <= 0) {
                postMessage({ success: false, error: "Audio signal is too short." });
                return;
            }

            // Spectrogram & Pitch Tracking Arrays
            const spectrogramData = []; // Will store arrays of size (frameSize/2)
            const pitches = [];
            const rms = [];
            const centroids = [];
            const rolloffs = [];
            const zcr = [];
            const frameFlatness = [];

            // Window function (Hanning)
            const window = new Float32Array(frameSize);
            for (let i = 0; i < frameSize; i++) {
                window[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (frameSize - 1)));
            }

            let clippingCount = 0;
            const half = frameSize / 2;

            // Target column count for visual spectrogram (max 300 to prevent heavy DOM/rendering lag)
            const stepMultiplier = Math.max(1, Math.floor(numFrames / 300));

            for (let f = 0; f < numFrames; f++) {
                const start = f * hopSize;
                const frameSamples = normalizedSamples.slice(start, start + frameSize);

                // Calculate RMS Energy
                let sumSq = 0;
                let zeroCrosses = 0;
                for (let i = 0; i < frameSamples.length; i++) {
                    const val = frameSamples[i];
                    sumSq += val * val;
                    if (Math.abs(val) >= 0.98) {
                        clippingCount++;
                    }
                    if (i > 0) {
                        const prev = frameSamples[i - 1];
                        if ((prev >= 0 && val < 0) || (prev < 0 && val >= 0)) {
                            zeroCrosses++;
                        }
                    }
                }
                const frameRMS = Math.sqrt(sumSq / frameSamples.length);
                rms.push(frameRMS);
                zcr.push(zeroCrosses / frameSamples.length);

                // Autocorrelation Pitch Tracking
                const minLag = Math.floor(sampleRate / 450);
                const maxLag = Math.floor(sampleRate / 50);
                let bestLag = -1;
                let maxCorr = -Infinity;

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

                let pitch = 0;
                if (bestLag !== -1 && frameRMS > 0.012) {
                    const energy = sumSq;
                    const normalizedCorr = maxCorr / energy;
                    // Strict threshold for clean periodic harmonics
                    if (normalizedCorr > 0.38) {
                        pitch = sampleRate / bestLag;
                    }
                }
                pitches.push(pitch);

                // FFT for Spectrogram and Centroid
                const re = new Float32Array(frameSize);
                const im = new Float32Array(frameSize);
                for (let i = 0; i < frameSize; i++) {
                    re[i] = frameSamples[i] * window[i];
                    im[i] = 0;
                }

                fft(re, im);

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

                // Downsample spectrogram columns for drawing (avoids transferring huge arrays)
                if (f % stepMultiplier === 0) {
                    spectrogramData.push(Array.from(magnitudes.map(m => Math.min(255, Math.max(0, Math.round(20 * Math.log10(m + 0.0001) + 80)) * 2.5))));
                }

                // Centroid & Rolloff
                let centroid = 0;
                let rolloff = 0;
                if (totalMag > 0.0001) {
                    let weightedSum = 0;
                    let cumulative = 0;
                    const targetRolloff = 0.85 * totalMag;
                    let foundRolloff = false;

                    for (let i = 0; i < half; i++) {
                        const freq = (i * sampleRate) / frameSize;
                        weightedSum += freq * magnitudes[i];
                        
                        cumulative += magnitudes[i];
                        if (!foundRolloff && cumulative >= targetRolloff) {
                            rolloff = freq;
                            foundRolloff = true;
                        }
                    }
                    centroid = weightedSum / totalMag;
                }
                centroids.push(centroid);
                rolloffs.push(rolloff);
            }

            // VAD and Speech Statistics
            const rmsThreshold = 0.015;
            const speechIndices = [];
            for (let i = 0; i < numFrames; i++) {
                if (rms[i] > rmsThreshold) {
                    speechIndices.push(i);
                }
            }
            const speechPercentage = (speechIndices.length / numFrames) * 100;

            const speechPitches = speechIndices.map(i => pitches[i]).filter(p => p > 0);
            const speechCentroids = speechIndices.map(i => centroids[i]);
            const speechRolloffs = speechIndices.map(i => rolloffs[i]);
            const speechZCR = speechIndices.map(i => zcr[i]);
            const speechFlatness = speechIndices.map(i => frameFlatness[i]);

            const avgRMS = rms.reduce((a, b) => a + b, 0) / numFrames;
            const peakRMS = Math.max(...rms);
            const clippingPercentage = (clippingCount / normalizedSamples.length) * 100;

            const avgPitch = speechPitches.length > 0 ? speechPitches.reduce((a, b) => a + b, 0) / speechPitches.length : 0;
            
            const stdDev = (arr, mean) => {
                if (arr.length === 0) return 0;
                const sqDiff = arr.map(v => Math.pow(v - mean, 2));
                return Math.sqrt(sqDiff.reduce((a, b) => a + b, 0) / arr.length);
            };

            const pitchStd = speechPitches.length > 0 ? stdDev(speechPitches, avgPitch) : 0;
            const avgCentroid = speechCentroids.length > 0 ? speechCentroids.reduce((a, b) => a + b, 0) / speechCentroids.length : 0;
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
            const speechRMS = speechIndices.map(i => rms[i]);
            if (speechRMS.length > 1) {
                let diffSum = 0;
                for (let i = 0; i < speechRMS.length - 1; i++) {
                    diffSum += Math.abs(speechRMS[i] - speechRMS[i + 1]);
                }
                const avgSpeechRMS = speechRMS.reduce((a, b) => a + b, 0) / speechRMS.length;
                shimmer = diffSum / (speechRMS.length - 1) / Math.max(avgSpeechRMS, 0.0001);
            }

            // SNR Estimation
            const silenceRMS = rms.filter(r => r <= rmsThreshold);
            let estimatedSNR = 35;
            if (silenceRMS.length > 0 && speechIndices.length > 0) {
                const avgSilence = silenceRMS.reduce((a, b) => a + b, 0) / silenceRMS.length;
                const avgSpeech = speechIndices.reduce((sum, idx) => sum + rms[idx], 0) / speechIndices.length;
                if (avgSilence > 0.0001) {
                    estimatedSNR = 20 * Math.log10(avgSpeech / Math.max(avgSilence, 0.0001));
                }
            }
            estimatedSNR = Math.max(0, Math.min(60, estimatedSNR));

            // Speech Segment Boundaries
            const segments = [];
            let segmentStart = -1;
            let segmentIndex = 1;
            const frameDuration = hopSize / sampleRate;

            for (let i = 0; i < numFrames; i++) {
                const isSpeech = rms[i] > rmsThreshold;
                if (isSpeech && segmentStart === -1) {
                    segmentStart = i * frameDuration;
                } else if (!isSpeech && segmentStart !== -1) {
                    const segmentEnd = i * frameDuration;
                    const segDur = segmentEnd - segmentStart;
                    if (segDur >= 0.4) { // Only count segments longer than 400ms
                        segments.push({
                            index: segmentIndex++,
                            start: segmentStart,
                            end: segmentEnd,
                            duration: segDur
                        });
                    }
                    segmentStart = -1;
                }
            }
            if (segmentStart !== -1) {
                const segmentEnd = numFrames * frameDuration;
                const segDur = segmentEnd - segmentStart;
                if (segDur >= 0.4) {
                    segments.push({
                        index: segmentIndex++,
                        start: segmentStart,
                        end: segmentEnd,
                        duration: segDur
                    });
                }
            }

            // If no segments found, make a single segment
            if (segments.length === 0 && numFrames > 0) {
                segments.push({
                    index: 1,
                    start: 0,
                    end: numFrames * frameDuration,
                    duration: numFrames * frameDuration
                });
            }

            // Post response back to main thread
            postMessage({
                success: true,
                features: {
                    duration: normalizedSamples.length / sampleRate,
                    sampleRate,
                    avgRMS,
                    peakRMS,
                    clippingPercentage,
                    speechPercentage,
                    estimatedSNR,
                    avgPitch,
                    pitchStd,
                    avgCentroid,
                    avgRolloff,
                    avgZCR,
                    jitter,
                    shimmer,
                    avgFlatness
                },
                spectrogram: spectrogramData,
                pitches,
                rms,
                centroids,
                segments
            });

        } catch (error) {
            postMessage({ success: false, error: error.message });
        }
    }
};

// Signal Normalization helper
function normalize(samples) {
    let maxVal = 0;
    for (let i = 0; i < samples.length; i++) {
        const absVal = Math.abs(samples[i]);
        if (absVal > maxVal) maxVal = absVal;
    }

    if (maxVal === 0) return samples;

    const normalized = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
        normalized[i] = samples[i] / maxVal;
    }
    return normalized;
}
