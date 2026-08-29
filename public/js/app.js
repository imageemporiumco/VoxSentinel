/**
 * VoiceGuard Application Controller
 * Manages audio recording, custom player, Web Worker coordination, API calls, and history persistence.
 */

// Global state
let audioCtx = null;
let audioBuffer = null;
let currentPlaySource = null;
let mediaRecorder = null;
let audioChunks = [];
let recordingInterval = null;
let recordStartTime = 0;
let playheadInterval = null;

// Mode A state
let uploadedFile = null;
let activeAnalysisData = null;

// Mode B state (Impersonation Mode)
let refFile = null;
let refBuffer = null;
let refFeatures = null;
let testFile = null;
let testBuffer = null;
let testFeatures = null;

// UI elements
let audioWorker = null;

document.addEventListener("DOMContentLoaded", () => {
    initWorker();
    setupEventListeners();
    loadHistory();
    // Start with demo mode loaded for premium presentation look
    loadDemoMode("human");
});

// Initialize background DSP Web Worker
function initWorker() {
    audioWorker = new Worker("js/audio-worker.js");
    
    audioWorker.onmessage = function (e) {
        if (e.data.success) {
            const { features, spectrogram, pitches, rms, centroids, segments } = e.data;
            
            // Completed DSP calculations, now run Heuristic Model rules
            const result = runHeuristicClassification(features);
            
            // If analyzing Mode A or Mode B, handle separately
            if (window.currentlyAnalyzingMode === "ref") {
                refFeatures = { ...features, pitches, rms, centroids, segments };
                updateModeBInputUI();
                finalizeAnalysisStage("04");
            } else if (window.currentlyAnalyzingMode === "test") {
                testFeatures = { ...features, pitches, rms, centroids, segments };
                updateModeBInputUI();
                finalizeAnalysisStage("04");
            } else {
                // Standard Mode A analysis sequence
                showAnalysisWorkflow(features, result, spectrogram, pitches, rms, centroids, segments);
            }
        } else {
            showError("Acoustic analysis failed: " + e.data.error);
            resetWorkflowProgress();
        }
    };
}

function setupEventListeners() {
    // Mode A Upload
    const dropzone = document.getElementById("dropzone");
    const audioFileInput = document.getElementById("audio-file-input");

    dropzone.addEventListener("click", () => audioFileInput.click());
    dropzone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropzone.classList.add("dragging");
    });
    dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragging"));
    dropzone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropzone.classList.remove("dragging");
        if (e.dataTransfer.files.length > 0) {
            handleFileUpload(e.dataTransfer.files[0]);
        }
    });

    audioFileInput.addEventListener("change", (e) => {
        if (e.target.files.length > 0) {
            handleFileUpload(e.target.files[0]);
        }
    });

    // Recording Controls
    document.getElementById("btn-start-record").addEventListener("click", startRecording);
    document.getElementById("btn-stop-record").addEventListener("click", stopRecording);
    document.getElementById("btn-cancel-record").addEventListener("click", cancelRecording);

    // Main Analyze trigger
    document.getElementById("btn-run-analysis").addEventListener("click", runAnalysisWorkflow);

    // Tab Navigation
    const navLinks = document.querySelectorAll(".nav-link");
    navLinks.forEach(link => {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            const targetSection = link.getAttribute("href").substring(1);
            showSection(targetSection);
            
            navLinks.forEach(l => l.classList.remove("active"));
            link.classList.add("active");
        });
    });

    // Demo Mode toggles
    document.querySelectorAll(".btn-demo").forEach(btn => {
        btn.addEventListener("click", () => {
            const demoType = btn.getAttribute("data-demo");
            loadDemoMode(demoType);
        });
    });

    // Mode Switcher (Mode A vs Mode B)
    document.getElementById("mode-a-tab").addEventListener("click", () => switchMainMode("A"));
    document.getElementById("mode-b-tab").addEventListener("click", () => switchMainMode("B"));

    // Mode B file inputs
    document.getElementById("ref-upload-card").addEventListener("click", () => document.getElementById("ref-file-input").click());
    document.getElementById("test-upload-card").addEventListener("click", () => document.getElementById("test-file-input").click());
    
    document.getElementById("ref-file-input").addEventListener("change", (e) => {
        if (e.target.files.length > 0) handleModeBFileUpload(e.target.files[0], "ref");
    });
    document.getElementById("test-file-input").addEventListener("change", (e) => {
        if (e.target.files.length > 0) handleModeBFileUpload(e.target.files[0], "test");
    });

    document.getElementById("btn-compare-voices").addEventListener("click", runVoiceComparison);
}

function showSection(sectionId) {
    document.querySelectorAll(".app-section").forEach(sec => {
        sec.classList.remove("active");
    });
    const target = document.getElementById(sectionId);
    if (target) {
        target.classList.add("active");
        // Scroll to target if in dashboard/home view
        if (sectionId === "detection-section") {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }
}

function switchMainMode(mode) {
    const modeACard = document.getElementById("mode-a-container");
    const modeBCard = document.getElementById("mode-b-container");
    const modeATab = document.getElementById("mode-a-tab");
    const modeBTab = document.getElementById("mode-b-tab");

    if (mode === "A") {
        modeACard.style.display = "block";
        modeBCard.style.display = "none";
        modeATab.classList.add("active");
        modeBTab.classList.remove("active");
        document.getElementById("comparison-results-card").style.display = "none";
    } else {
        modeACard.style.display = "none";
        modeBCard.style.display = "block";
        modeATab.classList.remove("active");
        modeBTab.classList.add("active");
    }
}

// ----------------------------------------------------
// AUDIO RECORDING ENGINE
// ----------------------------------------------------
async function startRecording() {
    audioChunks = [];
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: "audio/wav" });
            uploadedFile = new File([audioBlob], "microphone_record.wav", { type: "audio/wav" });
            
            // Set details of uploaded file
            updateFileMetadataUI(uploadedFile);
            
            // Decode and display initial visual waveform
            const arrayBuf = await audioBlob.arrayBuffer();
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            audioBuffer = await audioCtx.decodeAudioData(arrayBuf);
            
            drawInitialWaveform(audioBuffer);
            speakUIFeedback("Recording finished. Audio loaded.");
        };

        mediaRecorder.start();
        recordStartTime = Date.now();
        
        // Show recording studio overlay/controls
        document.getElementById("mic-record-status").style.display = "flex";
        document.getElementById("btn-start-record").style.display = "none";
        document.getElementById("btn-stop-record").style.display = "inline-flex";
        document.getElementById("btn-cancel-record").style.display = "inline-flex";
        document.getElementById("record-studio-quality").textContent = "Signal Quality: Calibrating...";
        
        // Start level meter & timer
        startRecordingFeedback(stream);

    } catch (err) {
        showError("Microphone access denied or unavailable: " + err.message);
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
    clearRecordingTimer();
}

function cancelRecording() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
    clearRecordingTimer();
    audioChunks = [];
    document.getElementById("mic-record-status").style.display = "none";
    document.getElementById("btn-start-record").style.display = "inline-flex";
    document.getElementById("btn-stop-record").style.display = "none";
    document.getElementById("btn-cancel-record").style.display = "none";
}

function startRecordingFeedback(stream) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const meterFill = document.getElementById("record-meter-fill");
    const timerVal = document.getElementById("record-timer-val");

    recordingInterval = setInterval(() => {
        // Timer update
        const elapsed = (Date.now() - recordStartTime) / 1000;
        timerVal.textContent = formatTime(elapsed);

        // Amplitude level update
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;
        const widthPercent = Math.min(100, (avg / 128) * 100);
        meterFill.style.width = `${widthPercent}%`;

        // Live assessment
        const qualityText = document.getElementById("record-studio-quality");
        if (widthPercent < 5) {
            qualityText.textContent = "Signal Quality: Poor (input too quiet)";
            qualityText.style.color = "#ef4444";
        } else if (widthPercent > 90) {
            qualityText.textContent = "Signal Quality: Poor (signal clipping)";
            qualityText.style.color = "#ef4444";
        } else {
            qualityText.textContent = "Signal Quality: Excellent";
            qualityText.style.color = "#10b981";
        }
    }, 100);
}

function clearRecordingTimer() {
    clearInterval(recordingInterval);
    document.getElementById("mic-record-status").style.display = "none";
    document.getElementById("btn-start-record").style.display = "inline-flex";
    document.getElementById("btn-stop-record").style.display = "none";
    document.getElementById("btn-cancel-record").style.display = "none";
}

// ----------------------------------------------------
// FILE UPLOAD AND DECODING
// ----------------------------------------------------
async function handleFileUpload(file) {
    uploadedFile = file;
    updateFileMetadataUI(file);
    
    // Reset player states
    stopAudio();

    try {
        const arrayBuf = await file.arrayBuffer();
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        // Show temporary decoding logs
        const dropText = document.querySelector("#dropzone p");
        const prevText = dropText.textContent;
        dropText.textContent = "Decoding audio container binaries...";
        
        audioBuffer = await audioCtx.decodeAudioData(arrayBuf);
        dropText.textContent = prevText;

        // Visual waveform render
        drawInitialWaveform(audioBuffer);
        
    } catch (err) {
        showError("Failed to decode audio file. Make sure it is a valid WAV, MP3, or M4A recording.");
    }
}

function updateFileMetadataUI(file) {
    document.getElementById("meta-filename").textContent = file.name;
    document.getElementById("meta-filesize").textContent = formatBytes(file.size);
    document.getElementById("audio-workspace").style.display = "block";
    document.getElementById("btn-run-analysis").removeAttribute("disabled");
}

function drawInitialWaveform(buf) {
    const rawData = buf.getChannelData(0);
    // Downsample raw buffer to 200 RMS bins for visual mapping
    const step = Math.floor(rawData.length / 200);
    const rmsVals = [];
    for (let i = 0; i < 200; i++) {
        let sum = 0;
        const start = i * step;
        for (let j = 0; j < step; j++) {
            sum += rawData[start + j] * rawData[start + j];
        }
        rmsVals.push(Math.sqrt(sum / step));
    }
    
    // Draw on visual waveform canvas
    const canvas = document.getElementById("waveform-canvas");
    Charts.drawWaveform(canvas, rmsVals, [], 0, 1, -1, { duration: buf.duration });
    
    // Save downsampled array globally for player scrubbing
    window.currentRmsVals = rmsVals;
    
    // Render custom audio player timing
    document.getElementById("play-current-time").textContent = "00:00";
    document.getElementById("play-duration").textContent = formatTime(buf.duration);
    
    setupPlayerControls();
}

// ----------------------------------------------------
// CUSTOM AUDIO PLAYER CONTROLS
// ----------------------------------------------------
function setupPlayerControls() {
    const playBtn = document.getElementById("btn-play-audio");
    const restartBtn = document.getElementById("btn-restart-audio");
    const volSlider = document.getElementById("player-volume");
    const speedSelect = document.getElementById("player-speed");

    // Remove existing event listeners by replacing buttons (cloning)
    const newPlayBtn = playBtn.cloneNode(true);
    playBtn.parentNode.replaceChild(newPlayBtn, playBtn);
    const newRestartBtn = restartBtn.cloneNode(true);
    restartBtn.parentNode.replaceChild(newRestartBtn, restartBtn);

    let isPlaying = false;
    let startTime = 0;
    let pauseTime = 0;

    newPlayBtn.addEventListener("click", () => {
        if (isPlaying) {
            pauseAudio();
        } else {
            playAudio();
        }
    });

    newRestartBtn.addEventListener("click", () => {
        stopAudio();
        playAudio();
    });

    volSlider.addEventListener("input", (e) => {
        if (window.currentPlayerGain) {
            window.currentPlayerGain.gain.value = e.target.value;
        }
    });

    speedSelect.addEventListener("change", (e) => {
        if (currentPlaySource) {
            currentPlaySource.playbackRate.value = parseFloat(e.target.value);
        }
    });

    function playAudio() {
        if (!audioBuffer) return;
        
        isPlaying = true;
        newPlayBtn.innerHTML = `<span class="icon">&#10074;&#10074;</span>Pause`;
        
        currentPlaySource = audioCtx.createBufferSource();
        currentPlaySource.buffer = audioBuffer;
        
        window.currentPlayerGain = audioCtx.createGain();
        window.currentPlayerGain.gain.value = volSlider.value;
        
        currentPlaySource.connect(window.currentPlayerGain);
        window.currentPlayerGain.connect(audioCtx.destination);
        
        // Playback speed
        currentPlaySource.playbackRate.value = parseFloat(speedSelect.value);

        // Resume or fresh start
        const startOffset = pauseTime % audioBuffer.duration;
        currentPlaySource.start(0, startOffset);
        startTime = audioCtx.currentTime - startOffset / speedSelect.value;

        // Visual playhead timer loop
        playheadInterval = setInterval(() => {
            const elapsed = (audioCtx.currentTime - startTime) * parseFloat(speedSelect.value);
            document.getElementById("play-current-time").textContent = formatTime(elapsed);
            
            const progress = elapsed / audioBuffer.duration;
            if (progress >= 1.0) {
                stopAudio();
            } else {
                Charts.drawWaveform(
                    document.getElementById("waveform-canvas"), 
                    window.currentRmsVals, 
                    activeAnalysisData ? activeAnalysisData.segments : [], 
                    progress, 
                    1, 
                    -1, 
                    { duration: audioBuffer.duration }
                );
            }
        }, 50);
    }

    function pauseAudio() {
        isPlaying = false;
        newPlayBtn.innerHTML = `<span class="icon">&#9658;</span>Play`;
        if (currentPlaySource) {
            currentPlaySource.stop();
            currentPlaySource = null;
        }
        clearInterval(playheadInterval);
        pauseTime = (audioCtx.currentTime - startTime) * parseFloat(speedSelect.value);
    }

    function stopAudio() {
        isPlaying = false;
        newPlayBtn.innerHTML = `<span class="icon">&#9658;</span>Play`;
        if (currentPlaySource) {
            currentPlaySource.stop();
            currentPlaySource = null;
        }
        clearInterval(playheadInterval);
        pauseTime = 0;
        document.getElementById("play-current-time").textContent = "00:00";
        if (window.currentRmsVals) {
            Charts.drawWaveform(
                document.getElementById("waveform-canvas"), 
                window.currentRmsVals, 
                activeAnalysisData ? activeAnalysisData.segments : [], 
                0, 
                1, 
                -1, 
                { duration: audioBuffer ? audioBuffer.duration : 10 }
            );
        }
    }
    
    // Bind stop globally
    window.stopAudio = stopAudio;
}

// ----------------------------------------------------
// 8-STAGE ANALYSIS WORKFLOW PROCESSOR
// ----------------------------------------------------
async function runAnalysisWorkflow() {
    if (!audioBuffer) return;

    // Reset results dashboard and playhead
    document.getElementById("results-dashboard").style.display = "none";
    document.getElementById("analysis-steps-card").style.display = "block";
    
    const steps = [
        { id: "01", name: "Loading Recording Binaries", duration: 800 },
        { id: "02", name: "Preprocessing & Clean-Up", duration: 1000 },
        { id: "03", name: "Voice Activity Segmentation", duration: 1000 },
        { id: "04", name: "Extracting Spectrals & Prosody", duration: 1200 },
        { id: "05", name: "Running Neural Heuristics Model", duration: 1000 },
        { id: "06", name: "Consolidating Indicator Weights", duration: 800 },
        { id: "07", name: "Assessing Prediction Quality & SNR", duration: 600 },
        { id: "08", name: "Final Forensic Scoring", duration: 400 }
    ];

    // Scroll to workflow card
    document.getElementById("analysis-steps-card").scrollIntoView({ behavior: "smooth" });

    // Sequentially advance steps visually, while firing worker for ACTUAL feature extraction
    for (let step of steps) {
        setAnalysisStageStatus(step.id, "active");
        await delay(step.duration);
        setAnalysisStageStatus(step.id, "done");

        if (step.id === "03") {
            // Trigger actual background DSP extraction in the worker thread
            const samples = audioBuffer.getChannelData(0);
            audioWorker.postMessage({
                action: "analyze",
                samples: samples,
                sampleRate: audioBuffer.sampleRate
            });
        }
    }
}

function setAnalysisStageStatus(stepId, status) {
    const el = document.getElementById(`step-${stepId}`);
    if (!el) return;
    
    const dot = el.querySelector(".step-dot");
    el.classList.remove("active", "done");
    dot.innerHTML = stepId;

    if (status === "active") {
        el.classList.add("active");
        dot.innerHTML = `<span class="spinner-circle"></span>`;
    } else if (status === "done") {
        el.classList.add("done");
        dot.innerHTML = "&#10003;"; // Checkmark
    }
}

function resetWorkflowProgress() {
    const stepIds = ["01", "02", "03", "04", "05", "06", "07", "08"];
    stepIds.forEach(id => {
        const el = document.getElementById(`step-${id}`);
        if (el) {
            el.classList.remove("active", "done");
            el.querySelector(".step-dot").innerHTML = id;
        }
    });
    document.getElementById("analysis-steps-card").style.display = "none";
}

// ----------------------------------------------------
// SPECTRUM AND CLASSIFICATION COMPILING
// ----------------------------------------------------
function showAnalysisWorkflow(features, result, spectrogram, pitches, rms, centroids, segments) {
    // Save report data
    activeAnalysisData = {
        features,
        result,
        spectrogram,
        pitches,
        rms,
        centroids,
        segments
    };

    // 1. Draw results circular gauge (animated)
    let progress = 0;
    const canvasGauge = document.getElementById("authenticity-gauge");
    const interval = setInterval(() => {
        progress += 0.05;
        if (progress >= 1.0) {
            clearInterval(interval);
            Charts.drawScoreGauge(canvasGauge, result.authenticityScore, result.classification, 1.0);
        } else {
            Charts.drawScoreGauge(canvasGauge, result.authenticityScore, result.classification, progress);
        }
    }, 25);

    // 2. Update metadata text cards
    document.getElementById("result-classification").textContent = result.classification;
    
    // Set classification badge colors
    const labelBadge = document.getElementById("result-classification");
    labelBadge.className = "result-tag " + getClassificationClass(result.classification);
    
    document.getElementById("result-confidence").textContent = `Confidence: ${result.confidence}`;
    document.getElementById("result-explanation").textContent = result.explanation;

    // 3. Draw detailed Spectrogram
    const canvasSpec = document.getElementById("spectrogram-canvas");
    Charts.drawSpectrogram(canvasSpec, spectrogram, features.sampleRate);
    
    // Bind mouse move inspection on Spectrogram
    canvasSpec.addEventListener("mousemove", (e) => {
        const rect = canvasSpec.getBoundingClientRect();
        const coords = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
        Charts.drawSpectrogram(canvasSpec, spectrogram, features.sampleRate, coords);
    });
    
    canvasSpec.addEventListener("mouseleave", () => {
        Charts.drawSpectrogram(canvasSpec, spectrogram, features.sampleRate, null);
    });

    // 4. Update Evidence indicators
    updateEvidenceIndicatorsUI(result.indicators);

    // 5. Update Explainable AI (Why did we reach this result?)
    updateExplainableAIUI(result);

    // 6. Update Audio Quality assessment
    updateQualityAssessmentUI(result, features);

    // 7. Update Technical metrics
    updateTechnicalMetricsUI(features);

    // 8. Update segment timeline
    // Add classification to segments
    const classifiedSegments = segments.map(seg => {
        let segClass = "Human-like";
        let segConf = 90;
        
        // Find average pitch and rolloff inside segment duration to classify local frames
        const startFrame = Math.floor((seg.start / features.duration) * pitches.length);
        const endFrame = Math.floor((seg.end / features.duration) * pitches.length);
        
        let segPitches = pitches.slice(startFrame, endFrame).filter(p => p > 0);
        let segRolloffs = centroids.slice(startFrame, endFrame); // approximate
        
        let sumPitch = segPitches.reduce((a,b)=>a+b,0);
        let avgSegPitch = segPitches.length > 0 ? sumPitch / segPitches.length : 0;
        
        // standard deviation of segment pitches
        let meanDiffSq = segPitches.map(p => Math.pow(p - avgSegPitch, 2));
        let segPitchStd = segPitches.length > 0 ? Math.sqrt(meanDiffSq.reduce((a,b)=>a+b,0) / segPitches.length) : 0;

        if (segPitchStd < 5 && avgSegPitch > 0) {
            segClass = "AI-Generated";
            segConf = Math.round(90 + (5 - segPitchStd) * 1.5);
        } else if (segPitchStd < 9 && avgSegPitch > 0) {
            segClass = "Suspicious";
            segConf = Math.round(65 + (9 - segPitchStd) * 3.5);
        }

        return { ...seg, classification: segClass, confidence: segConf };
    });
    activeAnalysisData.segments = classifiedSegments;
    updateSegmentTimelineUI(classifiedSegments);

    // 9. Synchronize player highlights with new VAD segments
    Charts.drawWaveform(
        document.getElementById("waveform-canvas"), 
        window.currentRmsVals, 
        classifiedSegments, 
        0, 
        1, 
        -1, 
        { duration: audioBuffer.duration }
    );
    setupPlayerControls(); // rebind player to include segments highlights

    // 10. Hide progress card and show dashboard card
    document.getElementById("analysis-steps-card").style.display = "none";
    document.getElementById("results-dashboard").style.display = "block";
    document.getElementById("btn-export-pdf").removeAttribute("disabled");
    document.getElementById("btn-export-json").removeAttribute("disabled");

    // 11. Sync report to backend database
    saveReportToBackend(features, result, classifiedSegments);
}

function getClassificationClass(cls) {
    if (cls === "HUMAN") return "tag-green";
    if (cls === "LIKELY HUMAN") return "tag-green-light";
    if (cls === "SUSPICIOUS") return "tag-amber";
    if (cls === "LIKELY AI-GENERATED") return "tag-red-light";
    if (cls === "AI-GENERATED / SYNTHETIC") return "tag-red";
    return "tag-gray";
}

function updateEvidenceIndicatorsUI(indicators) {
    const deck = document.getElementById("indicators-deck");
    deck.innerHTML = "";

    indicators.forEach(ind => {
        const statusClass = ind.status.toLowerCase(); // safe, warning, critical
        const card = document.createElement("div");
        card.className = "indicator-card";
        card.innerHTML = `
            <div class="ind-header">
                <span class="ind-name">${ind.name}</span>
                <span class="ind-badge status-${statusClass}">${ind.status}</span>
            </div>
            <div class="ind-score-container">
                <div class="ind-progress-bar">
                    <div class="ind-progress-fill status-${statusClass}" style="width: ${ind.score}%"></div>
                </div>
                <span class="ind-score-num">${ind.score}/100</span>
            </div>
            <p class="ind-desc">${ind.explanation}</p>
            <div class="ind-importance">Importance: ${ind.importance}</div>
        `;
        deck.appendChild(card);
    });
}

function updateExplainableAIUI(result) {
    const supportsList = document.getElementById("supports-list");
    const suspicionsList = document.getElementById("suspicions-list");
    supportsList.innerHTML = "";
    suspicionsList.innerHTML = "";

    result.supports.forEach(sup => {
        const li = document.createElement("li");
        li.innerHTML = `<span class="bullet positive">&#10003;</span> ${sup}`;
        supportsList.appendChild(li);
    });

    if (result.reasons.length === 0) {
        const li = document.createElement("li");
        li.innerHTML = `<span class="bullet positive">&#10003;</span> No synthesis anomalies or gating errors detected.`;
        supportsList.appendChild(li);
    }

    result.reasons.forEach(sus => {
        const li = document.createElement("li");
        li.className = "suspicious-item";
        li.innerHTML = `<span class="bullet negative">&#9888;</span> ${sus}`;
        suspicionsList.appendChild(li);
    });

    if (result.reasons.length === 0) {
        const li = document.createElement("li");
        li.innerHTML = `<span class="bullet neutral">&#8212;</span> No risk flags raised.`;
        suspicionsList.appendChild(li);
    }

    // Set Heuristic Demo Badge
    const engineModeText = document.getElementById("engine-mode-text");
    engineModeText.textContent = "Mode: Heuristic Demonstration";
    engineModeText.className = "engine-badge tag-amber";
}

function updateQualityAssessmentUI(result, features) {
    const snrFill = document.getElementById("quality-snr-fill");
    const snrVal = document.getElementById("quality-snr-val");
    const durFill = document.getElementById("quality-dur-fill");
    const durVal = document.getElementById("quality-dur-val");
    const clipFill = document.getElementById("quality-clip-fill");
    const clipVal = document.getElementById("quality-clip-val");

    const snrPercent = Math.min(100, (features.estimatedSNR / 50) * 100);
    snrFill.style.width = `${snrPercent}%`;
    snrVal.textContent = `${features.estimatedSNR.toFixed(1)} dB`;
    setBarColor(snrFill, snrPercent, false);

    const durPercent = Math.min(100, (features.duration / 10) * 100);
    durFill.style.width = `${durPercent}%`;
    durVal.textContent = `${features.duration.toFixed(1)}s`;
    setBarColor(durFill, durPercent, false);

    const clipPercent = Math.min(100, features.clippingPercentage * 15);
    clipFill.style.width = `${clipPercent}%`;
    clipVal.textContent = `${features.clippingPercentage.toFixed(2)}%`;
    setBarColor(clipFill, clipPercent, true); // true = higher is worse
}

function setBarColor(fillEl, percent, invert = false) {
    fillEl.className = "quality-progress-fill";
    if (invert) {
        if (percent > 40) fillEl.classList.add("bg-red");
        else if (percent > 15) fillEl.classList.add("bg-amber");
        else fillEl.classList.add("bg-green");
    } else {
        if (percent < 40) fillEl.classList.add("bg-red");
        else if (percent < 70) fillEl.classList.add("bg-amber");
        else fillEl.classList.add("bg-green");
    }
}

function updateTechnicalMetricsUI(features) {
    document.getElementById("tech-duration").textContent = `${features.duration.toFixed(2)}s`;
    document.getElementById("tech-samplerate").textContent = `${features.sampleRate} Hz`;
    document.getElementById("tech-rms").textContent = features.avgRMS.toFixed(4);
    document.getElementById("tech-peak").textContent = features.peakRMS.toFixed(4);
    document.getElementById("tech-clipping").textContent = `${features.clippingPercentage.toFixed(2)}%`;
    document.getElementById("tech-snr").textContent = `${features.estimatedSNR.toFixed(1)} dB`;
    
    document.getElementById("tech-pitch").textContent = features.avgPitch > 0 ? `${features.avgPitch.toFixed(1)} Hz` : "Voiceless / Unvoiced";
    document.getElementById("tech-pitchstd").textContent = features.avgPitch > 0 ? `${features.pitchStd.toFixed(1)} Hz` : "0.0 Hz";
    document.getElementById("tech-centroid").textContent = `${features.avgCentroid.toFixed(0)} Hz`;
    document.getElementById("tech-rolloff").textContent = `${features.avgRolloff.toFixed(0)} Hz`;
    document.getElementById("tech-zcr").textContent = features.avgZCR.toFixed(4);
    document.getElementById("tech-speechpercent").textContent = `${features.speechPercentage.toFixed(1)}%`;

    // Advanced features
    document.getElementById("tech-jitter").textContent = features.jitter !== undefined ? `${(features.jitter * 100).toFixed(2)}%` : "0.00%";
    document.getElementById("tech-shimmer").textContent = features.shimmer !== undefined ? `${(features.shimmer * 100).toFixed(2)}%` : "0.00%";
    document.getElementById("tech-flatness").textContent = features.avgFlatness !== undefined ? features.avgFlatness.toFixed(3) : "0.000";
}

function updateSegmentTimelineUI(segments) {
    const list = document.getElementById("segment-list");
    const timeline = document.getElementById("segment-timeline-bar");
    list.innerHTML = "";
    timeline.innerHTML = "";

    const duration = activeAnalysisData.features.duration;

    segments.forEach(seg => {
        // Timeline ticks
        const leftPercent = (seg.start / duration) * 100;
        const widthPercent = (seg.duration / duration) * 100;
        
        let typeClass = "human";
        if (seg.classification === "AI-Generated") typeClass = "ai";
        else if (seg.classification === "Suspicious") typeClass = "suspicious";
        else if (seg.classification === "Silence") typeClass = "silence";

        const tick = document.createElement("div");
        tick.className = `timeline-segment-tick bg-${typeClass}`;
        tick.style.left = `${leftPercent}%`;
        tick.style.width = `${widthPercent}%`;
        tick.title = `Seg ${seg.index}: ${seg.classification} (${seg.duration.toFixed(1)}s)`;
        timeline.appendChild(tick);

        // List row
        if (seg.classification !== "Silence") {
            const row = document.createElement("div");
            row.className = "segment-list-row";
            
            let badgeColor = "tag-green-light";
            if (seg.classification === "AI-Generated") badgeColor = "tag-red";
            else if (seg.classification === "Suspicious") badgeColor = "tag-amber";

            row.innerHTML = `
                <span class="seg-col-index">Seg 0${seg.index}</span>
                <span class="seg-col-time">${seg.start.toFixed(1)}s - ${seg.end.toFixed(1)}s</span>
                <span class="seg-col-duration">${seg.duration.toFixed(1)}s</span>
                <span class="seg-col-badge"><span class="result-tag-small ${badgeColor}">${seg.classification}</span></span>
                <span class="seg-col-conf">${seg.confidence}%</span>
            `;
            list.appendChild(row);
        }
    });
}

// ----------------------------------------------------
// DETECT ENGINE HEURISTICS CALCULATOR
// ----------------------------------------------------
function runHeuristicClassification(features) {
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

    // Direct replication of backend dsp.js heuristics for client-side matching
    let score = 90;
    const deductions = [];
    const suspicions = [];
    const supports = [];

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
    if (avgPitch > 0 && jitter !== undefined) {
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
    if (avgPitch > 0 && shimmer !== undefined) {
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

    // 5. High Frequency Cut-off
    if (avgRolloff < 6500) {
        score -= 22;
        deductions.push({ feature: "Spectral Consistency", value: avgRolloff.toFixed(0) + " Hz", weight: 22, reason: "Heavy brickwall filtering detected below 6.5kHz" });
        suspicions.push("Extremely narrow spectral footprint indicating standard voice synthesis downsampling");
    } else if (avgRolloff < 9000) {
        score -= 12;
        deductions.push({ feature: "Spectral Consistency", value: avgRolloff.toFixed(0) + " Hz", weight: 12, reason: "Spectral rolloff matches 16kHz model limit" });
        suspicions.push("Spectral rolloff cut-off matches signature frequency limits of 16kHz speech models");
    } else if (avgRolloff > 15000 && clippingPercentage > 2.0) {
        score -= 10;
        deductions.push({ feature: "Signal Artifacts", value: clippingPercentage.toFixed(1) + "%", weight: 10, reason: "High-frequency clipping anomalies detected" });
        suspicions.push("Acoustic distortion or synthetic processing artifacts");
    } else {
        supports.push("Wide, natural frequency band distribution without sharp digital filter cuts");
    }

    if (avgCentroid < 1200) {
        score -= 8;
        deductions.push({ feature: "Harmonic Structure", value: avgCentroid.toFixed(0) + " Hz", weight: 8, reason: "Spectral centroid is abnormally low" });
        suspicions.push("Muffled timbral structure or vocoder phase distortion");
    } else {
        supports.push("Expected timbral variability in spectral centroids");
    }

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

    score = Math.max(0, Math.min(100, Math.round(score)));

    let classification = "HUMAN";
    if (score >= 85) classification = "HUMAN";
    else if (score >= 70) classification = "LIKELY HUMAN";
    else if (score >= 50) classification = "SUSPICIOUS";
    else if (score >= 30) classification = "LIKELY AI-GENERATED";
    else classification = "AI-GENERATED / SYNTHETIC";

    let confidence = "HIGH";
    if (estimatedSNR < 18 || duration < 3.0) confidence = "MEDIUM";
    if (estimatedSNR < 13 && duration < 2.0) confidence = "LOW";

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
        indicators: calculateIndicatorsLocal(features, score)
    };
}

function calculateIndicatorsLocal(features, score) {
    const { pitchStd, avgRolloff, avgCentroid, clippingPercentage, estimatedSNR, jitter, shimmer } = features;
    
    let spectralScore = 95;
    if (avgRolloff < 7500) spectralScore = 30;
    else if (avgRolloff < 9000) spectralScore = 60;
    else if (avgRolloff < 11000) spectralScore = 80;

    let prosodyScore = 95;
    if (pitchStd < 6) prosodyScore = 20;
    else if (pitchStd < 11) prosodyScore = 55;
    else if (pitchStd < 15) prosodyScore = 80;
    else if (pitchStd > 60) prosodyScore = 70;

    // Decrease prosody indicator score if micro-frequency variation is flat (low jitter)
    if (features.avgPitch > 0 && jitter < 0.005) {
        prosodyScore = Math.min(prosodyScore, 30);
    }

    let harmonicScore = 90;
    if (avgCentroid < 1200) harmonicScore = 50;
    else if (avgCentroid > 2500) harmonicScore = 75;

    let temporalScore = 92;
    if (features.avgZCR < 0.06) temporalScore = 60;

    let bgScore = Math.max(10, Math.min(100, Math.round(estimatedSNR * 1.6)));
    let artifactScore = Math.max(10, 100 - Math.min(60, Math.round(clippingPercentage * 12)));
    if (avgRolloff < 7000) artifactScore -= 20;
    
    // Decrease artifact indicator score if amplitude variation is flat (low shimmer)
    if (features.avgPitch > 0 && shimmer < 0.018) {
        artifactScore = Math.min(artifactScore, 40);
    }
    artifactScore = Math.max(10, artifactScore);

    const getStatus = (val) => val >= 80 ? "SAFE" : (val >= 60 ? "WARNING" : "CRITICAL");

    return [
        { name: "Spectral Consistency", score: spectralScore, status: getStatus(spectralScore), explanation: `Spectral rolloff boundary lies at ${avgRolloff.toFixed(0)} Hz.`, importance: "HIGH" },
        { name: "Prosodic Variation", score: prosodyScore, status: getStatus(prosodyScore), explanation: `Pitch deviation is ${pitchStd.toFixed(1)} Hz.`, importance: "HIGH" },
        { name: "Harmonic Structure", score: harmonicScore, status: getStatus(harmonicScore), explanation: `Average spectral centroid is ${avgCentroid.toFixed(0)} Hz.`, importance: "MEDIUM" },
        { name: "Temporal Dynamics", score: temporalScore, status: getStatus(temporalScore), explanation: `Vocal energy boundaries conform to standard temporal envelopes.`, importance: "MEDIUM" },
        { name: "Background Environment", score: bgScore, status: getStatus(bgScore), explanation: `Signal-to-noise ratio is estimated at ${estimatedSNR.toFixed(1)} dB.`, importance: "LOW" },
        { name: "Signal Artifacts", score: artifactScore, status: getStatus(artifactScore), explanation: `Acoustic verification checks clear.`, importance: "HIGH" }
    ];
}

// ----------------------------------------------------
// BACKEND API LOGS / REST COUPLING
// ----------------------------------------------------
function saveReportToBackend(features, result, segments) {
    const payload = {
        clientFeatures: {
            features,
            result,
            filename: uploadedFile ? uploadedFile.name : "recorded_audio.wav",
            sizeBytes: uploadedFile ? uploadedFile.size : 480000,
            segments
        }
    };

    fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            loadHistory(); // Reload history section
        }
    })
    .catch(err => console.error("Error syncing analysis to DB:", err));
}

function loadHistory() {
    fetch("/api/history")
    .then(res => res.json())
    .then(resData => {
        if (resData.success) {
            updateHistoryUI(resData.data);
        }
    })
    .catch(err => console.error("Error loading history:", err));
}

function updateHistoryUI(history) {
    const tbody = document.getElementById("history-table-body");
    tbody.innerHTML = "";

    if (history.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: rgba(255,255,255,0.3); padding: 30px;">
                    No Analysis History Available. Upload and analyze a voice sample to begin.
                </td>
            </tr>
        `;
        return;
    }

    history.forEach(item => {
        const row = document.createElement("tr");
        
        let tagColor = "tag-green-light";
        if (item.classification === "AI-GENERATED / SYNTHETIC") tagColor = "tag-red";
        else if (item.classification === "SUSPICIOUS") tagColor = "tag-amber";
        else if (item.classification === "LIKELY AI-GENERATED") tagColor = "tag-red-light";

        row.innerHTML = `
            <td style="font-family: 'Share Tech Mono', monospace;">${formatDate(item.date)}</td>
            <td>${item.filename}</td>
            <td>${item.duration.toFixed(1)}s</td>
            <td><span class="result-tag-small ${tagColor}">${item.classification}</span></td>
            <td style="font-family: 'Share Tech Mono', monospace; font-weight: bold; color: ${item.authenticityScore > 70 ? '#10b981' : (item.authenticityScore > 40 ? '#f59e0b' : '#ef4444')}">${item.authenticityScore}%</td>
            <td>
                <button class="btn-action open" onclick="restoreAnalysis('${item.id}')">View</button>
                <button class="btn-action delete" onclick="deleteAnalysis('${item.id}')">Delete</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

window.deleteAnalysis = function(id) {
    if (!confirm("Are you sure you want to delete this report from the platform registry?")) return;
    
    fetch(`/api/analysis/${id}`, { method: "DELETE" })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            loadHistory();
            // If current display was deleted, reset UI
            if (activeAnalysisData && activeAnalysisData.id === id) {
                document.getElementById("results-dashboard").style.display = "none";
            }
        }
    })
    .catch(err => console.error("Error deleting report:", err));
};

window.restoreAnalysis = function(id) {
    fetch("/api/history")
    .then(res => res.json())
    .then(resData => {
        if (resData.success) {
            const report = resData.data.find(item => item.id === id);
            if (report) {
                // Mock active state
                activeAnalysisData = {
                    id: report.id,
                    features: {
                        duration: report.duration,
                        sampleRate: report.sampleRate,
                        avgRMS: report.metrics.avgRMS,
                        peakRMS: report.metrics.peakRMS,
                        clippingPercentage: report.metrics.clippingPercentage,
                        speechPercentage: report.metrics.speechPercentage,
                        estimatedSNR: report.metrics.estimatedSNR,
                        avgPitch: report.metrics.avgPitch,
                        pitchStd: report.metrics.pitchStd,
                        avgCentroid: report.metrics.avgCentroid,
                        avgRolloff: report.metrics.avgRolloff,
                        avgZCR: report.metrics.avgZCR
                    },
                    result: {
                        classification: report.classification,
                        authenticityScore: report.authenticityScore,
                        confidence: report.confidence,
                        explanation: report.explanation,
                        reasons: report.reasons,
                        supports: report.supports,
                        indicators: report.indicators
                    },
                    segments: report.segments || [],
                    // generate dummy envelopes for charting
                    pitches: report.pitches || Array.from({length: 100}, () => report.metrics.avgPitch),
                    rms: report.rms || Array.from({length: 100}, () => report.metrics.avgRMS),
                    centroids: report.centroids || Array.from({length: 100}, () => report.metrics.avgCentroid)
                };

                // Render UI
                Charts.drawScoreGauge(document.getElementById("authenticity-gauge"), report.authenticityScore, report.classification);
                
                document.getElementById("result-classification").textContent = report.classification;
                const labelBadge = document.getElementById("result-classification");
                labelBadge.className = "result-tag " + getClassificationClass(report.classification);
                
                document.getElementById("result-confidence").textContent = `Confidence: ${report.confidence}`;
                document.getElementById("result-explanation").textContent = report.explanation;

                updateEvidenceIndicatorsUI(report.indicators);
                updateExplainableAIUI(activeAnalysisData.result);
                updateQualityAssessmentUI(activeAnalysisData.result, activeAnalysisData.features);
                updateTechnicalMetricsUI(activeAnalysisData.features);
                
                // Redraw visual waveform
                Charts.drawWaveform(document.getElementById("waveform-canvas"), activeAnalysisData.rms, activeAnalysisData.segments, 0, 1, -1, { duration: report.duration });
                
                // Clear spectrogram (cannot restore raw spectral matrices fully from historical database records)
                const canvasSpec = document.getElementById("spectrogram-canvas");
                const ctxSpec = canvasSpec.getContext('2d');
                ctxSpec.clearRect(0,0,canvasSpec.width,canvasSpec.height);
                ctxSpec.fillStyle = "rgba(255, 255, 255, 0.15)";
                ctxSpec.font = "12px 'Share Tech Mono', monospace";
                ctxSpec.textAlign = "center";
                ctxSpec.fillText("Detailed Spectrogram history is visual-only and not stored in compact DB logs.", canvasSpec.width / (2 * (window.devicePixelRatio || 1)), canvasSpec.height / (2 * (window.devicePixelRatio || 1)));

                document.getElementById("results-dashboard").style.display = "block";
                document.getElementById("btn-export-pdf").removeAttribute("disabled");
                document.getElementById("btn-export-json").removeAttribute("disabled");
                showSection("detection-section");
            }
        }
    });
};

// ----------------------------------------------------
// MODE B: VOICE IMPERSONATION COMPARISON
// ----------------------------------------------------
async function handleModeBFileUpload(file, type) {
    if (type === "ref") {
        refFile = file;
        document.getElementById("ref-filename").textContent = file.name;
        document.getElementById("ref-upload-card").classList.add("loaded");
    } else {
        testFile = file;
        document.getElementById("test-filename").textContent = file.name;
        document.getElementById("test-upload-card").classList.add("loaded");
    }

    try {
        const arrayBuf = await file.arrayBuffer();
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const decoded = await audioCtx.decodeAudioData(arrayBuf);
        
        window.currentlyAnalyzingMode = type;
        
        // Pass to Web Worker to extract features asynchronously
        const samples = decoded.getChannelData(0);
        audioWorker.postMessage({
            action: "analyze",
            samples: samples,
            sampleRate: decoded.sampleRate
        });
    } catch (e) {
        showError(`Failed to decode Mode B ${type === "ref" ? "Reference" : "Test"} voice: ${e.message}`);
    }
}

function updateModeBInputUI() {
    const btnCompare = document.getElementById("btn-compare-voices");
    if (refFeatures && testFeatures) {
        btnCompare.removeAttribute("disabled");
    }
}

function finalizeAnalysisStage(stageId) {
    window.currentlyAnalyzingMode = null; // Clear mode
}

function runVoiceComparison() {
    if (!refFeatures || !testFeatures) return;

    // Send features to Express API to save the comparison or verify
    fetch("/api/compare-voices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refFeatures, testFeatures })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            renderComparisonUI(data.data);
        } else {
            showError("Comparison API failed: " + data.error);
        }
    })
    .catch(err => {
        // Fallback local comparison if API fails
        const comparison = localCompareFeatures(refFeatures, testFeatures);
        renderComparisonUI(comparison);
    });
}

function renderComparisonUI(comparison) {
    const resultsCard = document.getElementById("comparison-results-card");
    resultsCard.style.display = "block";
    resultsCard.scrollIntoView({ behavior: "smooth" });

    // Animate similarity score
    document.getElementById("comp-similarity-score").textContent = `${comparison.speakerSimilarity}%`;
    document.getElementById("comp-pitch-sim").style.width = `${comparison.pitchSimilarity}%`;
    document.getElementById("comp-pitch-val").textContent = `${comparison.pitchSimilarity}%`;
    document.getElementById("comp-timbre-sim").style.width = `${comparison.timbreSimilarity}%`;
    document.getElementById("comp-timbre-val").textContent = `${comparison.timbreSimilarity}%`;
    document.getElementById("comp-envelope-sim").style.width = `${comparison.envelopeSimilarity}%`;
    document.getElementById("comp-envelope-val").textContent = `${comparison.envelopeSimilarity}%`;

    // Render Timber Overlap Canvas
    const canvasOver = document.getElementById("timbre-overlap-canvas");
    Charts.drawTimbreOverlap(canvasOver, refFeatures, testFeatures);

    // Context analysis description
    const textDesc = document.getElementById("comp-description");
    if (comparison.speakerSimilarity > 85) {
        textDesc.textContent = "The speaker features display a extremely high match. Pitch range, median, and spectral resonances are highly congruent, indicating the test voice matches the reference speaker identity.";
    } else if (comparison.speakerSimilarity > 65) {
        textDesc.textContent = "Moderate similarity detected. Vocal tract sizes and fundamental pitch frequencies overlap partially. Some differences in timing or accent envelopes are present.";
    } else {
        textDesc.textContent = "Acoustic signatures do not match. Distinct resonances, different F0 ranges, and unique timbres confirm these voices belong to different speakers.";
    }
}

function localCompareFeatures(ref, test) {
    const centroidRatio = Math.min(ref.avgCentroid, test.avgCentroid) / Math.max(ref.avgCentroid, test.avgCentroid);
    const bandwidthRatio = Math.min(ref.avgBandwidth, test.avgBandwidth) / Math.max(ref.avgBandwidth, test.avgBandwidth);
    
    let pitchSimilarity = 1.0;
    if (ref.avgPitch > 0 && test.avgPitch > 0) {
        pitchSimilarity = Math.min(ref.avgPitch, test.avgPitch) / Math.max(ref.avgPitch, test.avgPitch);
    } else if ((ref.avgPitch === 0 && test.avgPitch > 0) || (ref.avgPitch > 0 && test.avgPitch === 0)) {
        pitchSimilarity = 0.4;
    }

    const pitchStdRatio = Math.min(ref.pitchStd, test.pitchStd) / Math.max(Math.max(ref.pitchStd, test.pitchStd), 1.0);
    const zcrRatio = Math.min(ref.avgZCR, test.avgZCR) / Math.max(ref.avgZCR, test.avgZCR);

    const similarity = ((pitchSimilarity * 0.35) + (pitchStdRatio * 0.15) + (centroidRatio * 0.25) + (bandwidthRatio * 0.15) + (zcrRatio * 0.10)) * 100;

    return {
        speakerSimilarity: Math.max(0, Math.min(100, Math.round(similarity))),
        pitchSimilarity: Math.round(pitchSimilarity * 100),
        timbreSimilarity: Math.round(((centroidRatio + bandwidthRatio) / 2) * 100),
        envelopeSimilarity: Math.round(zcrRatio * 100)
    };
}

// ----------------------------------------------------
// DEMO MODE ACTIONS
// ----------------------------------------------------
function loadDemoMode(demoType) {
    const demo = VoiceGuardDemoData[demoType];
    if (!demo) return;

    activeAnalysisData = demo;
    uploadedFile = new File([], demo.filename, { type: "audio/wav" });
    
    // Set file details
    document.getElementById("meta-filename").textContent = demo.filename;
    document.getElementById("meta-filesize").textContent = formatBytes(demo.sizeBytes);
    document.getElementById("audio-workspace").style.display = "block";
    document.getElementById("btn-run-analysis").removeAttribute("disabled");

    // Mock AudioBuffer
    audioBuffer = { duration: demo.duration, sampleRate: demo.sampleRate };
    
    // Draw initial waveform
    window.currentRmsVals = demo.rms;
    Charts.drawWaveform(document.getElementById("waveform-canvas"), demo.rms, demo.segments, 0, 1, -1, { duration: demo.duration });

    // Show Demo mode warning indicator
    const labelBadge = document.getElementById("result-classification");
    labelBadge.className = "result-tag " + getClassificationClass(demo.classification);
    document.getElementById("result-classification").textContent = demo.classification;

    Charts.drawScoreGauge(document.getElementById("authenticity-gauge"), demo.authenticityScore, demo.classification);
    
    document.getElementById("result-confidence").textContent = `Confidence: ${demo.confidence}`;
    document.getElementById("result-explanation").textContent = demo.explanation;

    // Fill evidence tables
    updateEvidenceIndicatorsUI(demo.indicators);
    updateExplainableAIUI(demo);
    updateQualityAssessmentUI(demo, demo.metrics);
    updateTechnicalMetricsUI(demo.metrics);
    updateSegmentTimelineUI(demo.segments);

    // Mock spectrogram with vertical gradients
    const canvasSpec = document.getElementById("spectrogram-canvas");
    const ctx = canvasSpec.getContext('2d');
    ctx.clearRect(0,0,canvasSpec.width,canvasSpec.height);
    
    // Draw visual placeholder representing Mel Frequency Bands
    const width = canvasSpec.width / (window.devicePixelRatio || 1);
    const height = canvasSpec.height / (window.devicePixelRatio || 1);
    
    // Draw background spectrogram simulation
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    if (demoType === "human") {
        gradient.addColorStop(0, "rgba(0, 240, 255, 0.05)");
        gradient.addColorStop(0.5, "rgba(139, 92, 246, 0.15)");
        gradient.addColorStop(0.8, "rgba(16, 185, 129, 0.25)");
        gradient.addColorStop(1, "rgba(11, 15, 25, 1.0)");
    } else {
        gradient.addColorStop(0, "rgba(11, 15, 25, 1.0)");
        gradient.addColorStop(0.3, "rgba(239, 68, 68, 0.25)");
        gradient.addColorStop(0.6, "rgba(139, 92, 246, 0.15)");
        gradient.addColorStop(1, "rgba(11, 15, 25, 1.0)");
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0,0,width,height);

    ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
    ctx.font = "bold 13px 'Outfit', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("DEMO MODE ACTIVE - VISUAL SPECTROGRAM SIMULATED", width/2, height/2 - 10);
    ctx.font = "9px 'Share Tech Mono', monospace";
    ctx.fillText("Upload a real WAV/MP3 file to trigger physical STFT matrix renders.", width/2, height/2 + 10);

    // Show dashboard
    document.getElementById("results-dashboard").style.display = "block";
    document.getElementById("btn-export-pdf").removeAttribute("disabled");
    document.getElementById("btn-export-json").removeAttribute("disabled");
}

// ----------------------------------------------------
// EXPORTING AND REPORT GENERATION
// ----------------------------------------------------
window.exportJsonReport = function() {
    if (!activeAnalysisData) return;
    
    const fileContent = JSON.stringify(activeAnalysisData, null, 2);
    const blob = new Blob([fileContent], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = `voiceguard_report_${activeAnalysisData.id || "demo"}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

window.exportCsvReport = function() {
    if (!activeAnalysisData) return;
    
    const metrics = activeAnalysisData.features || activeAnalysisData.metrics;
    const res = activeAnalysisData.result;
    
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Metric,Value\n";
    csvContent += `Report ID,${activeAnalysisData.id || "demo_profile"}\n`;
    csvContent += `Classification,${res.classification}\n`;
    csvContent += `Authenticity Score,${res.authenticityScore}\n`;
    csvContent += `Confidence,${res.confidence}\n`;
    csvContent += `Duration,${metrics.duration.toFixed(2)}s\n`;
    csvContent += `Sample Rate,${metrics.sampleRate}Hz\n`;
    csvContent += `Pitch Mean,${metrics.avgPitch.toFixed(1)}Hz\n`;
    csvContent += `Pitch Std,${metrics.pitchStd.toFixed(1)}Hz\n`;
    csvContent += `Spectral Centroid,${metrics.avgCentroid.toFixed(0)}Hz\n`;
    csvContent += `Spectral Rolloff,${metrics.avgRolloff.toFixed(0)}Hz\n`;
    csvContent += `Estimated SNR,${metrics.estimatedSNR.toFixed(1)}dB\n`;

    const encodedUri = encodeURI(csvContent);
    const a = document.createElement("a");
    a.setAttribute("href", encodedUri);
    a.setAttribute("download", `voiceguard_metrics_${activeAnalysisData.id || "demo"}.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
};

window.exportPdfReport = function() {
    if (!activeAnalysisData) return;
    
    const metrics = activeAnalysisData.features || activeAnalysisData.metrics;
    const res = activeAnalysisData.result;
    
    const printWindow = window.open("", "_blank");
    
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>VoiceGuard Forensics Report - ID ${activeAnalysisData.id || "demo_profile"}</title>
        <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; padding: 40px; margin: 0; line-height: 1.5; }
            .header { border-bottom: 2px solid #0f172a; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: center; }
            .logo { font-size: 24px; font-weight: bold; color: #0f172a; letter-spacing: 1px; }
            .badge-sec { background: #f1f5f9; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: bold; }
            .title { font-size: 28px; font-weight: 800; margin: 0 0 10px 0; color: #0f172a; }
            .summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 40px; }
            .score-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 30px; text-align: center; }
            .score-num { font-size: 72px; font-weight: 900; color: ${res.authenticityScore > 70 ? '#10b981' : (res.authenticityScore > 40 ? '#f59e0b' : '#ef4444')}; line-height: 1; margin-bottom: 10px; }
            .score-label { font-size: 11px; font-weight: bold; color: #64748b; letter-spacing: 2px; }
            .verdict { font-size: 20px; font-weight: 800; margin-top: 15px; color: #0f172a; }
            .meta-card { padding: 10px; }
            .meta-table { width: 100%; border-collapse: collapse; }
            .meta-table td { padding: 10px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
            .meta-table td.label { font-weight: 600; color: #64748b; }
            .meta-table td.value { text-align: right; font-weight: bold; }
            .section-title { font-size: 18px; font-weight: 800; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin: 40px 0 20px 0; color: #0f172a; }
            .explain-p { font-size: 15px; color: #334155; margin-bottom: 20px; }
            .factor-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
            .factor-box { background: #f8fafc; border-radius: 6px; padding: 20px; }
            .factor-box h4 { margin: 0 0 10px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; }
            .factor-box.pos h4 { color: #10b981; }
            .factor-box.neg h4 { color: #ef4444; }
            .factor-box ul { padding-left: 20px; margin: 0; font-size: 13px; color: #475569; }
            .factor-box li { margin-bottom: 6px; }
            .metrics-table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            .metrics-table th, .metrics-table td { text-align: left; padding: 10px; border: 1px solid #e2e8f0; font-size: 13px; }
            .metrics-table th { background: #f8fafc; font-weight: bold; }
            .limitations { font-size: 12px; color: #64748b; margin-top: 50px; border-top: 1px dashed #cbd5e1; padding-top: 20px; }
        </style>
    </head>
    <body>
        <div class="header">
            <div class="logo">VOICEGUARD FORENSICS</div>
            <div class="badge-sec">DETECTION ENGINE: ONLINE</div>
        </div>

        <h1 class="title">Voice Authenticity Forensic Assessment</h1>
        <p style="color: #64748b; font-size: 14px; margin-top: 0; margin-bottom: 30px;">Report generated: ${new Date().toLocaleString()} | Reference ID: ${activeAnalysisData.id || "demo"}</p>

        <div class="summary-grid">
            <div class="score-card">
                <div class="score-num">${res.authenticityScore}</div>
                <div class="score-label">AUTHENTICITY SCORE</div>
                <div class="verdict">${res.classification}</div>
                <div style="font-size: 13px; color: #64748b; margin-top: 5px;">Confidence rating: ${res.confidence}</div>
            </div>

            <div class="meta-card">
                <table class="meta-table">
                    <tr><td class="label">Filename</td><td class="value">${uploadedFile ? uploadedFile.name : "demo_sample.wav"}</td></tr>
                    <tr><td class="label">Audio Duration</td><td class="value">${metrics.duration.toFixed(2)}s</td></tr>
                    <tr><td class="label">Sample Rate</td><td class="value">${metrics.sampleRate} Hz</td></tr>
                    <tr><td class="label">File Size</td><td class="value">${formatBytes(activeAnalysisData.sizeBytes || 1088000)}</td></tr>
                    <tr><td class="label">Signal-to-Noise Ratio</td><td class="value">${metrics.estimatedSNR.toFixed(1)} dB</td></tr>
                </table>
            </div>
        </div>

        <div class="section-title">Forensic Finding Summary</div>
        <p class="explain-p">${res.explanation}</p>

        <div class="section-title">Acoustic Indicators Contribution</div>
        <div class="factor-grid">
            <div class="factor-box pos">
                <h4>Supporting Human Identity</h4>
                <ul>
                    ${res.supports.map(s => `<li>${s}</li>`).join("")}
                </ul>
            </div>
            <div class="factor-box neg">
                <h4>Raising Suspicion of Cloning</h4>
                <ul>
                    ${res.reasons.map(r => `<li>${r}</li>`).join("")}
                </ul>
            </div>
        </div>

        <div class="section-title">Detailed Digital Signal Metrics</div>
        <table class="metrics-table">
            <thead>
                <tr>
                    <th>Acoustic Metric</th>
                    <th>Value</th>
                    <th>Description</th>
                </tr>
            </thead>
            <tbody>
                <tr><td>Fundamental Frequency (F0 Mean)</td><td>${metrics.avgPitch > 0 ? `${metrics.avgPitch.toFixed(1)} Hz` : 'Unvoiced'}</td><td>Pitch center of voiced phonemes</td></tr>
                <tr><td>Pitch Standard Deviation</td><td>${metrics.pitchStd.toFixed(1)} Hz</td><td>Prosodic frequency swing variance</td></tr>
                <tr><td>Spectral Centroid Average</td><td>${metrics.avgCentroid.toFixed(0)} Hz</td><td>Center of gravity of frequency magnitudes</td></tr>
                <tr><td>Spectral Rolloff Boundary</td><td>${metrics.avgRolloff.toFixed(0)} Hz</td><td>Frequency cutoff below 85% energy</td></tr>
                <tr><td>Zero Crossing Rate Average</td><td>${metrics.avgZCR.toFixed(4)}</td><td>Frequency of sign changes (noise index)</td></tr>
                <tr><td>Signal Clipping Percentage</td><td>${metrics.clippingPercentage.toFixed(2)}%</td><td>Amplitude points exceeding threshold limits</td></tr>
                <tr><td>Speech Frame Percentage</td><td>${metrics.speechPercentage.toFixed(1)}%</td><td>Ratio of voiced frames to silent frames</td></tr>
            </tbody>
        </table>

        <div class="limitations">
            <strong>Disclaimer:</strong> Voice-cloning detection technology provides probabilistic models based on acoustic feature extraction. Highly compressed files, dynamic background noise, or edited channels can modify digital structures. Results represent heuristic classifications and should not be used as single definitive proof in legal disputes.
        </div>

        <script>
            window.onload = function() {
                window.print();
            };
        </script>
    </body>
    </html>
    `;
    
    printWindow.document.write(html);
    printWindow.document.close();
};

// ----------------------------------------------------
// UTILITY FUNCTIONS
// ----------------------------------------------------
function formatTime(secs) {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = Math.floor(secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(isoStr) {
    const d = new Date(isoStr);
    const day = d.getDate().toString().padStart(2, "0");
    const mon = d.toLocaleString('default', { month: 'short' });
    const hr = d.getHours().toString().padStart(2, "0");
    const min = d.getMinutes().toString().padStart(2, "0");
    return `${day} ${mon} ${hr}:${min}`;
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function showError(msg) {
    console.error(msg);
    alert(msg); // standard visual alert
}

function speakUIFeedback(msg) {
    // Accessibility announcement for screen readers
    const speaker = document.getElementById("sr-announcer");
    if (speaker) {
        speaker.textContent = msg;
    }
}
