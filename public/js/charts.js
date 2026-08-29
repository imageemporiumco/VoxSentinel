/**
 * VoiceGuard Custom High-DPI Canvas Charts
 * Handles all visual plots: Score Gauge, Audio Waveform, Spectrogram, Segment Timeline, and Comparison Overlays.
 */

const Charts = {
    // Helper to scale canvas for high-DPI displays (retina screens)
    setupCanvas(canvas, containerWidth, containerHeight) {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = containerWidth * dpr;
        canvas.height = containerHeight * dpr;
        canvas.style.width = `${containerWidth}px`;
        canvas.style.height = `${containerHeight}px`;
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        return ctx;
    },

    // Draw the Circular Authenticity Score Gauge
    drawScoreGauge(canvas, score, classification, animProgress = 1.0) {
        const width = canvas.parentElement.clientWidth || 220;
        const height = 220;
        const ctx = this.setupCanvas(canvas, width, height);

        const cx = width / 2;
        const cy = height / 2;
        const radius = 80;
        const targetScore = score * animProgress;

        // Clean background
        ctx.clearRect(0, 0, width, height);

        // Pick color based on classification
        let color = "#10b981"; // Safe Green
        let glowColor = "rgba(16, 185, 129, 0.4)";
        if (classification === "AI-GENERATED / SYNTHETIC" || classification === "LIKELY AI-GENERATED") {
            color = "#ef4444"; // Danger Red
            glowColor = "rgba(239, 68, 68, 0.4)";
        } else if (classification === "SUSPICIOUS") {
            color = "#f59e0b"; // Warning Amber
            glowColor = "rgba(245, 158, 11, 0.4)";
        } else if (classification === "INCONCLUSIVE") {
            color = "#6b7280"; // Gray
            glowColor = "rgba(107, 114, 128, 0.3)";
        }

        // Draw track ring
        ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
        ctx.lineWidth = 10;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0.75 * Math.PI, 2.25 * Math.PI);
        ctx.stroke();

        // Draw score fill ring
        const endAngle = 0.75 * Math.PI + (1.5 * Math.PI * (targetScore / 100));
        ctx.strokeStyle = color;
        ctx.lineWidth = 12;
        ctx.lineCap = "round";

        // Outer glow path
        ctx.shadowColor = color;
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0.75 * Math.PI, endAngle);
        ctx.stroke();

        // Turn off shadow for text and other elements
        ctx.shadowBlur = 0;

        // Draw Center Score Text
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "900 46px 'Outfit', sans-serif";
        ctx.fillText(Math.round(targetScore).toString(), cx, cy - 8);

        // Label below Score
        ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
        ctx.font = "700 11px 'Outfit', sans-serif";
        ctx.fillText("AUTHENTICITY", cx, cy + 22);
        ctx.fillText("SCORE", cx, cy + 34);

        // Subtext outer labels (0 and 100 markers)
        ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
        ctx.font = "bold 10px 'Share Tech Mono', monospace";
        ctx.fillText("0", cx - 62, cy + 62);
        ctx.fillText("100", cx + 62, cy + 62);
    },

    // Draw the Audio Waveform
    drawWaveform(canvas, rmsArray, segments = [], playheadProgress = 0, zoom = 1, hoverIndex = -1, audioData = null) {
        const width = canvas.parentElement.clientWidth || 800;
        const height = 150;
        const ctx = this.setupCanvas(canvas, width, height);

        ctx.clearRect(0, 0, width, height);

        if (!rmsArray || rmsArray.length === 0) return;

        const pad = 10;
        const graphWidth = width - 2 * pad;
        const graphHeight = height - 30;
        const middleY = graphHeight / 2 + pad;
        const len = rmsArray.length;

        // Zoom offset calculations
        const viewLen = Math.floor(len / zoom);
        const maxOffset = len - viewLen;
        const startOffset = Math.min(maxOffset, Math.floor(playheadProgress * maxOffset * 0.1)); // Center zoom around playhead
        const viewArray = rmsArray.slice(startOffset, startOffset + viewLen);
        const viewStep = graphWidth / viewArray.length;

        // Draw Time Grid Lines
        ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i <= 10; i++) {
            const gx = pad + (graphWidth * (i / 10));
            ctx.moveTo(gx, pad);
            ctx.lineTo(gx, pad + graphHeight);
        }
        ctx.stroke();

        // Draw segments shading (e.g. Speech vs Silence or Human vs Suspicious)
        if (segments && segments.length > 0 && audioData) {
            const duration = audioData.duration;
            segments.forEach(seg => {
                const segStartPercent = seg.start / duration;
                const segEndPercent = seg.end / duration;
                
                // Map to zoom window
                const fullStartIdx = Math.floor(segStartPercent * len);
                const fullEndIdx = Math.floor(segEndPercent * len);
                
                if (fullEndIdx >= startOffset && fullStartIdx <= startOffset + viewLen) {
                    const startX = pad + Math.max(0, (fullStartIdx - startOffset) / viewLen) * graphWidth;
                    const endX = pad + Math.min(1.0, (fullEndIdx - startOffset) / viewLen) * graphWidth;
                    
                    let bg = "rgba(0, 240, 255, 0.05)"; // Speech
                    if (seg.classification === "AI-Generated" || seg.classification === "Suspicious") {
                        bg = "rgba(239, 68, 68, 0.08)";
                    } else if (seg.classification === "Silence") {
                        bg = "rgba(255, 255, 255, 0.01)";
                    }
                    
                    ctx.fillStyle = bg;
                    ctx.fillRect(startX, pad, endX - startX, graphHeight);
                }
            });
        }

        // Draw waveform amplitude bars
        const maxVal = Math.max(...viewArray, 0.01);
        for (let i = 0; i < viewArray.length; i++) {
            const val = viewArray[i];
            const barHeight = (val / maxVal) * graphHeight * 0.9;
            const bx = pad + i * viewStep;

            // Highlight color if hover
            let isHovered = false;
            if (hoverIndex !== -1) {
                const currentFullIndex = startOffset + i;
                const hoverFrameIndex = Math.floor(hoverIndex * len);
                if (Math.abs(currentFullIndex - hoverFrameIndex) < 2) {
                    isHovered = true;
                }
            }

            // Playhead coloring
            const isPlayed = (startOffset + i) / len <= playheadProgress;
            
            if (isHovered) {
                ctx.fillStyle = "#8b5cf6"; // Purple model focus
            } else if (isPlayed) {
                ctx.fillStyle = "#00f0ff"; // Glow Cyan
            } else {
                ctx.fillStyle = "rgba(0, 240, 255, 0.25)"; // Translucent Cyan
            }

            // Draw symmetric bar
            ctx.fillRect(bx, middleY - barHeight / 2, Math.max(1, viewStep - 1), barHeight);
        }

        // Draw Playhead line
        if (playheadProgress > 0 && playheadProgress <= 1.0) {
            const playheadIndex = Math.floor(playheadProgress * len);
            if (playheadIndex >= startOffset && playheadIndex <= startOffset + viewLen) {
                const px = pad + ((playheadIndex - startOffset) / viewLen) * graphWidth;
                ctx.strokeStyle = "#ef4444"; // Red playhead
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(px, pad - 2);
                ctx.lineTo(px, pad + graphHeight + 2);
                ctx.stroke();

                // Playhead circle top
                ctx.fillStyle = "#ef4444";
                ctx.beginPath();
                ctx.arc(px, pad - 2, 4, 0, 2 * Math.PI);
                ctx.fill();
            }
        }

        // Render time markers at bottom
        ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
        ctx.font = "9px 'Share Tech Mono', monospace";
        ctx.textAlign = "center";
        
        const totalDuration = audioData ? audioData.duration : 10;
        const visibleStartSec = (startOffset / len) * totalDuration;
        const visibleEndSec = ((startOffset + viewLen) / len) * totalDuration;

        for (let i = 0; i <= 5; i++) {
            const tx = pad + (graphWidth * (i / 5));
            const sec = visibleStartSec + (visibleEndSec - visibleStartSec) * (i / 5);
            ctx.fillText(`${sec.toFixed(2)}s`, tx, height - 8);
        }
    },

    // Draw Spectrogram Canvas
    drawSpectrogram(canvas, spectrogram2D, sampleRate, hoverCoords = null) {
        const width = canvas.parentElement.clientWidth || 800;
        const height = 240;
        const ctx = this.setupCanvas(canvas, width, height);

        ctx.clearRect(0, 0, width, height);

        if (!spectrogram2D || spectrogram2D.length === 0) {
            ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
            ctx.font = "14px 'Outfit', sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("Spectrogram rendering pending...", width / 2, height / 2);
            return;
        }

        const padLeft = 45;
        const padBottom = 25;
        const padRight = 15;
        const padTop = 15;
        const plotWidth = width - padLeft - padRight;
        const plotHeight = height - padTop - padBottom;

        const timeFrames = spectrogram2D.length;
        const freqBins = spectrogram2D[0].length;
        const colWidth = plotWidth / timeFrames;
        const rowHeight = plotHeight / freqBins;

        // Draw Grid Spectrogram Cells
        for (let t = 0; t < timeFrames; t++) {
            const x = padLeft + t * colWidth;
            for (let f = 0; f < freqBins; f++) {
                const val = spectrogram2D[t][f]; // 0 to 255
                // Map frequency bin (0 is low, freqBins is Nyquist)
                // Drawing from bottom (low freq) to top (high freq)
                const y = padTop + plotHeight - (f + 1) * rowHeight;

                // Color Map: Jet-like or Cyberspace (Black -> Blue -> Purple -> Red -> Yellow)
                let fillStyle;
                if (val < 30) {
                    fillStyle = `rgb(11, 15, 25)`; // Space base
                } else if (val < 90) {
                    const r = Math.round(((val - 30) / 60) * 10);
                    const g = Math.round(((val - 30) / 60) * 80);
                    const b = Math.round(((val - 30) / 60) * 150) + 50;
                    fillStyle = `rgb(${r}, ${g}, ${b})`;
                } else if (val < 180) {
                    const r = Math.round(((val - 90) / 90) * 140);
                    const g = Math.round(((val - 90) / 90) * 50) + 80;
                    const b = 200 - Math.round(((val - 90) / 90) * 80);
                    fillStyle = `rgb(${r}, ${g}, ${b})`;
                } else {
                    const r = 140 + Math.round(((val - 180) / 75) * 115);
                    const g = 130 + Math.round(((val - 180) / 75) * 125);
                    const b = Math.round(((val - 180) / 75) * 50);
                    fillStyle = `rgb(${r}, ${g}, ${b})`;
                }
                ctx.fillStyle = fillStyle;
                // Use a slightly larger size to prevent white seams
                ctx.fillRect(x, y, colWidth + 0.5, rowHeight + 0.5);
            }
        }

        // Draw frequency axis text (Left)
        ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
        ctx.font = "9px 'Share Tech Mono', monospace";
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";

        const nyquist = sampleRate / 2;
        const labelIntervals = 5;
        for (let i = 0; i <= labelIntervals; i++) {
            const freq = (nyquist * (i / labelIntervals)) / 1000; // in kHz
            const ly = padTop + plotHeight - (plotHeight * (i / labelIntervals));
            
            // Draw axis line segment
            ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(padLeft - 4, ly);
            ctx.lineTo(padLeft, ly);
            ctx.stroke();

            ctx.fillText(`${freq.toFixed(1)}k`, padLeft - 8, ly);
        }

        // Draw time axis (Bottom)
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        // We will assume 10 intervals
        for (let i = 0; i <= 5; i++) {
            const lx = padLeft + (plotWidth * (i / 5));
            ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
            ctx.beginPath();
            ctx.moveTo(lx, padTop + plotHeight);
            ctx.lineTo(lx, padTop + plotHeight + 4);
            ctx.stroke();
        }

        // Spectrogram Hover Details
        if (hoverCoords && hoverCoords.x >= padLeft && hoverCoords.x <= padLeft + plotWidth &&
            hoverCoords.y >= padTop && hoverCoords.y <= padTop + plotHeight) {
            
            // Draw crosshairs
            ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            // vertical line
            ctx.moveTo(hoverCoords.x, padTop);
            ctx.lineTo(hoverCoords.x, padTop + plotHeight);
            // horizontal line
            ctx.moveTo(padLeft, hoverCoords.y);
            ctx.lineTo(padLeft + plotWidth, hoverCoords.y);
            ctx.stroke();
            ctx.setLineDash([]); // Reset

            // Calculate exact details
            const percentX = (hoverCoords.x - padLeft) / plotWidth;
            const percentY = (padTop + plotHeight - hoverCoords.y) / plotHeight;
            const estFreq = percentY * nyquist;

            // Draw floating stats pill
            ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
            ctx.strokeStyle = "rgba(0, 240, 255, 0.4)";
            ctx.lineWidth = 1;
            
            const px = Math.min(width - 120, Math.max(padLeft + 10, hoverCoords.x - 55));
            const py = Math.max(padTop + 10, hoverCoords.y - 45);
            
            ctx.beginPath();
            ctx.roundRect(px, py, 110, 32, 4);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = "#00f0ff";
            ctx.font = "bold 9px 'Share Tech Mono', monospace";
            ctx.textAlign = "center";
            ctx.fillText(`Freq: ${estFreq.toFixed(0)} Hz`, px + 55, py + 8);
            
            const timeFrameIndex = Math.min(timeFrames - 1, Math.floor(percentX * timeFrames));
            const freqBinIndex = Math.min(freqBins - 1, Math.floor(percentY * freqBins));
            const magnitudeDB = (spectrogram2D[timeFrameIndex][freqBinIndex] / 2.5) - 80;
            ctx.fillStyle = "#ffffff";
            ctx.fillText(`Amp: ${magnitudeDB.toFixed(1)} dB`, px + 55, py + 20);
        }
    },

    // Mode B: Timbre Overlap Distribution (Speaker Comparison Chart)
    drawTimbreOverlap(canvas, refTimbre, testTimbre) {
        const width = canvas.parentElement.clientWidth || 360;
        const height = 140;
        const ctx = this.setupCanvas(canvas, width, height);

        ctx.clearRect(0, 0, width, height);

        const pad = 15;
        const chartW = width - 2 * pad;
        const chartH = height - 2 * pad;

        // Draw background grid
        ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 1; i < 4; i++) {
            const y = pad + chartH * (i / 4);
            ctx.moveTo(pad, y);
            ctx.lineTo(pad + chartW, y);
        }
        for (let i = 1; i < 6; i++) {
            const x = pad + chartW * (i / 6);
            ctx.moveTo(x, pad);
            ctx.lineTo(x, pad + chartH);
        }
        ctx.stroke();

        // Draw Timbre Envelope overlap curves
        // Timbre distributions are approximated by drawing normal curves with means at centroid and widths at bandwidth
        const drawTimbreCurve = (centroid, bandwidth, color, fillBg, label) => {
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.fillStyle = fillBg;

            // Map values to canvas coordinates
            // Normal human centroids lie between 500Hz and 3500Hz
            const minCent = 200;
            const maxCent = 4000;

            const mapX = (freq) => pad + ((freq - minCent) / (maxCent - minCent)) * chartW;

            ctx.beginPath();
            let first = true;
            for (let xFreq = minCent; xFreq <= maxCent; xFreq += 20) {
                // Normal Gaussian Distribution Equation
                const exponent = -Math.pow(xFreq - centroid, 2) / (2 * Math.pow(bandwidth, 2));
                const yVal = Math.exp(exponent); // 0 to 1
                
                const cx = mapX(xFreq);
                const cy = pad + chartH - (yVal * chartH * 0.8);

                if (first) {
                    ctx.moveTo(cx, cy);
                    first = false;
                } else {
                    ctx.lineTo(cx, cy);
                }
            }
            ctx.stroke();

            // Fill under curve
            ctx.lineTo(mapX(maxCent), pad + chartH);
            ctx.lineTo(mapX(minCent), pad + chartH);
            ctx.closePath();
            ctx.fill();

            // Draw mean line
            const mx = mapX(centroid);
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 2]);
            ctx.beginPath();
            ctx.moveTo(mx, pad + chartH);
            ctx.lineTo(mx, pad + chartH - chartH * 0.85);
            ctx.stroke();
            ctx.setLineDash([]);

            // Draw text tag
            ctx.fillStyle = color;
            ctx.font = "bold 8px 'Share Tech Mono', monospace";
            ctx.textAlign = "center";
            ctx.fillText(`${label}: ${centroid.toFixed(0)}Hz`, mx, pad + chartH - chartH * 0.88);
        };

        const refCent = refTimbre ? refTimbre.avgCentroid : 1600;
        const refBand = refTimbre ? refTimbre.avgBandwidth || 1200 : 1200;
        const testCent = testTimbre ? testTimbre.avgCentroid : 1300;
        const testBand = testTimbre ? testTimbre.avgBandwidth || 1000 : 1000;

        // Draw reference profile (Green)
        drawTimbreCurve(refCent, refBand, "#10b981", "rgba(16, 185, 129, 0.08)", "REF");
        // Draw test profile (Purple)
        drawTimbreCurve(testCent, testBand, "#8b5cf6", "rgba(139, 92, 246, 0.08)", "TEST");
    }
};

// Expose to global window
if (typeof window !== 'undefined') {
    window.Charts = Charts;
}
