const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const dsp = require('./dsp');

const app = express();
const PORT = process.env.PORT || 8080;
const DB_PATH = path.join(__dirname, 'db.json');

// Ensure db.json exists
if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ history: [] }, null, 2));
}

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Configure Multer for file uploads (storing in memory)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10 MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['.wav', '.mp3', '.ogg', '.m4a', '.webm', '.aac'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error(`Unsupported file type: ${ext}`));
        }
    }
});

// Helper to read database
function readDb() {
    try {
        const data = fs.readFileSync(DB_PATH, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return { history: [] };
    }
}

// Helper to write database
function writeDb(data) {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Error writing to database:", e);
    }
}

/**
 * Endpoint: POST /api/analyze
 * Accepts: multipart audio upload, or JSON body containing raw samples/clientFeatures.
 */
app.post('/api/analyze', upload.single('audio'), (req, res) => {
    try {
        let filename = "recorded_audio.wav";
        let sizeBytes = 0;
        let features = null;
        let result = null;

        // Check if client provided features directly (e.g. decoded in browser AudioContext)
        if (req.body.clientFeatures) {
            let clientData = req.body.clientFeatures;
            if (typeof clientData === 'string') {
                clientData = JSON.parse(clientData);
            }
            features = clientData.features;
            result = clientData.result;
            filename = clientData.filename || filename;
            sizeBytes = clientData.sizeBytes || 0;
        } 
        // Or check if a file was uploaded and we can parse it (WAV only on server)
        else if (req.file) {
            filename = req.file.originalname;
            sizeBytes = req.file.size;
            const ext = path.extname(filename).toLowerCase();

            if (ext === '.wav') {
                // Perform server-side DSP analysis
                const wavInfo = dsp.parseWav(req.file.buffer);
                features = dsp.extractFeatures(wavInfo.samples, wavInfo.sampleRate);
                result = dsp.analyzeDetection(features);
            } else {
                // If it is another format (like MP3) and client didn't supply features,
                // fall back to a heuristic description (since node can't decode MP3 in pure JS without external bins)
                return res.status(400).json({
                    success: false,
                    error: "Format unsupported on backend raw analysis. Please use WAV files for command-line uploads, or use the Web UI dashboard to auto-decode and analyze MP3/M4A/OGG formats."
                });
            }
        } else {
            return res.status(400).json({ success: false, error: "No audio file or analysis features provided." });
        }

        // Build the full analysis report
        const reportId = 'anly_' + Math.random().toString(36).substr(2, 9);
        const newRecord = {
            id: reportId,
            date: new Date().toISOString(),
            filename,
            sizeBytes,
            duration: features.duration,
            sampleRate: features.sampleRate,
            classification: result.classification,
            authenticityScore: result.authenticityScore,
            confidence: result.confidence,
            explanation: result.explanation,
            quality: result.quality,
            reasons: result.reasons || [],
            supports: result.supports || [],
            deductions: result.deductions || [],
            indicators: result.indicators || [],
            metrics: {
                avgRMS: features.avgRMS,
                peakRMS: features.peakRMS,
                clippingPercentage: features.clippingPercentage,
                speechPercentage: features.speechPercentage,
                estimatedSNR: features.estimatedSNR,
                avgPitch: features.avgPitch,
                pitchStd: features.pitchStd,
                avgCentroid: features.avgCentroid,
                avgBandwidth: features.avgBandwidth,
                avgRolloff: features.avgRolloff,
                avgZCR: features.avgZCR
            },
            // We do not save full raw wave coordinates to save space, but we save downsampled arrays for visualization
            pitches: features.pitches ? downsampleArray(features.pitches, 100) : [],
            rms: features.rms ? downsampleArray(features.rms, 100) : [],
            centroids: features.centroids ? downsampleArray(features.centroids, 100) : []
        };

        // Save to DB
        const db = readDb();
        db.history.unshift(newRecord);
        writeDb(db);

        res.json({
            success: true,
            data: newRecord
        });

    } catch (err) {
        console.error("Analysis failed:", err);
        res.status(500).json({
            success: false,
            error: "Acoustic analysis failed: " + err.message
        });
    }
});

/**
 * Endpoint: POST /api/compare-voices
 * Accepts: multipart uploads of reference and test audio files, or JSON containing features.
 */
const compareUpload = upload.fields([
    { name: 'reference', maxCount: 1 },
    { name: 'test', maxCount: 1 }
]);

app.post('/api/compare-voices', compareUpload, (req, res) => {
    try {
        let refFeatures = null;
        let testFeatures = null;

        // If client provided features directly in body
        if (req.body.refFeatures && req.body.testFeatures) {
            refFeatures = typeof req.body.refFeatures === 'string' ? JSON.parse(req.body.refFeatures) : req.body.refFeatures;
            testFeatures = typeof req.body.testFeatures === 'string' ? JSON.parse(req.body.testFeatures) : req.body.testFeatures;
        } 
        // Or if WAV files are uploaded
        else if (req.files && req.files.reference && req.files.test) {
            const refFile = req.files.reference[0];
            const testFile = req.files.test[0];

            if (path.extname(refFile.originalname).toLowerCase() !== '.wav' || 
                path.extname(testFile.originalname).toLowerCase() !== '.wav') {
                return res.status(400).json({
                    success: false,
                    error: "Comparison via raw file upload only supports WAV files on the backend. Use the web application dashboard to compare MP3/M4A/OGG formats."
                });
            }

            const refWav = dsp.parseWav(refFile.buffer);
            const testWav = dsp.parseWav(testFile.buffer);

            refFeatures = dsp.extractFeatures(refWav.samples, refWav.sampleRate);
            testFeatures = dsp.extractFeatures(testWav.samples, testWav.sampleRate);
        } else {
            return res.status(400).json({
                success: false,
                error: "Please provide both reference and test voice files or features."
            });
        }

        const comparison = dsp.compareFeatures(refFeatures, testFeatures);

        res.json({
            success: true,
            data: {
                speakerSimilarity: comparison.speakerSimilarity,
                pitchSimilarity: comparison.pitchSimilarity,
                timbreSimilarity: comparison.timbreSimilarity,
                envelopeSimilarity: comparison.envelopeSimilarity,
                refMetrics: {
                    avgPitch: refFeatures.avgPitch,
                    pitchStd: refFeatures.pitchStd,
                    avgCentroid: refFeatures.avgCentroid,
                    avgZCR: refFeatures.avgZCR
                },
                testMetrics: {
                    avgPitch: testFeatures.avgPitch,
                    pitchStd: testFeatures.pitchStd,
                    avgCentroid: testFeatures.avgCentroid,
                    avgZCR: testFeatures.avgZCR
                }
            }
        });

    } catch (err) {
        console.error("Comparison failed:", err);
        res.status(500).json({
            success: false,
            error: "Speaker comparison failed: " + err.message
        });
    }
});

/**
 * Endpoint: GET /api/history
 */
app.get('/api/history', (req, res) => {
    try {
        const db = readDb();
        res.json({
            success: true,
            data: db.history
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Endpoint: DELETE /api/analysis/:id
 */
app.delete('/api/analysis/:id', (req, res) => {
    try {
        const { id } = req.params;
        const db = readDb();
        const initialLen = db.history.length;
        db.history = db.history.filter(item => item.id !== id);
        
        if (db.history.length === initialLen) {
            return res.status(404).json({ success: false, error: "Record not found" });
        }

        writeDb(db);
        res.json({ success: true, message: "Record successfully deleted" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Helper: Downsample arrays for storage and plotting
function downsampleArray(arr, targetSize) {
    if (arr.length <= targetSize) return Array.from(arr);
    const step = arr.length / targetSize;
    const result = [];
    for (let i = 0; i < targetSize; i++) {
        const index = Math.floor(i * step);
        result.push(Number(arr[index].toFixed(4)));
    }
    return result;
}

// Error handling middleware
app.use((err, req, res, next) => {
    console.error("Server Error:", err);
    res.status(500).json({
        success: false,
        error: err.message || "An unexpected server error occurred."
    });
});

app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(` VoiceGuard platform running on port ${PORT}`);
    console.log(` Local dashboard: http://localhost:${PORT}`);
    console.log(`==================================================`);
});
