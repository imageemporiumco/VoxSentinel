const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

console.log("=========================================");
console.log(" Starting VoiceGuard Backend Integration Test");
console.log("=========================================");

// Start the Express server on a test port (8089)
const env = { ...process.env, PORT: '8089' };
const serverProcess = spawn('node', ['server.js'], { env, cwd: __dirname });

let stdoutBuffer = "";
serverProcess.stdout.on('data', (data) => {
    stdoutBuffer += data.toString();
});

serverProcess.stderr.on('data', (data) => {
    console.error("Server Error Output:", data.toString());
});

// Wait 1.5 seconds for the server to spin up, then query endpoints
setTimeout(() => {
    console.log("Verifying server startup log...");
    if (stdoutBuffer.includes("running on port 8089")) {
        console.log("✔ Server started successfully on port 8089");
    } else {
        console.log("⚠ Expected startup log not found, output received was:\n", stdoutBuffer);
    }

    testHistoryEndpoint();
}, 1500);

function testHistoryEndpoint() {
    console.log("Testing GET /api/history...");
    const req = http.get('http://localhost:8089/api/history', (res) => {
        let body = "";
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
            try {
                const json = JSON.parse(body);
                if (res.statusCode === 200 && json.success === true && Array.isArray(json.data)) {
                    console.log("✔ GET /api/history returned valid response structure");
                    console.log(`  Found ${json.data.length} records in database history.`);
                    
                    // Proceed to test comparison API mocking
                    testCompareEndpoint();
                } else {
                    console.error("✖ GET /api/history failed validation. Status code:", res.statusCode, "Body:", body);
                    terminateServer(1);
                }
            } catch (e) {
                console.error("✖ Failed to parse history JSON response:", e.message);
                terminateServer(1);
            }
        });
    });

    req.on('error', (err) => {
        console.error("✖ HTTP Request failed for GET /api/history:", err.message);
        terminateServer(1);
    });
}

function testCompareEndpoint() {
    console.log("Testing POST /api/compare-voices with JSON features payload...");
    
    // Mock features
    const mockRefFeatures = { avgPitch: 180, pitchStd: 20, avgCentroid: 1600, avgBandwidth: 1200, avgZCR: 0.08 };
    const mockTestFeatures = { avgPitch: 175, pitchStd: 18, avgCentroid: 1550, avgBandwidth: 1150, avgZCR: 0.075 };
    
    const postData = JSON.stringify({
        refFeatures: mockRefFeatures,
        testFeatures: mockTestFeatures
    });

    const options = {
        hostname: 'localhost',
        port: 8089,
        path: '/api/compare-voices',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    const req = http.request(options, (res) => {
        let body = "";
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
            try {
                const json = JSON.parse(body);
                if (res.statusCode === 200 && json.success === true && json.data.speakerSimilarity) {
                    console.log("✔ POST /api/compare-voices validated successfully");
                    console.log(`  Speaker Similarity score: ${json.data.speakerSimilarity}%`);
                    console.log(`  Timbre Similarity overlap: ${json.data.timbreSimilarity}%`);
                    
                    console.log("\n=========================================");
                    console.log(" Integration Tests Completed: ALL PASSED");
                    console.log("=========================================");
                    terminateServer(0);
                } else {
                    console.error("✖ POST /api/compare-voices failed validation. Status code:", res.statusCode, "Body:", body);
                    terminateServer(1);
                }
            } catch (e) {
                console.error("✖ Failed to parse comparison JSON response:", e.message);
                terminateServer(1);
            }
        });
    });

    req.on('error', (err) => {
        console.error("✖ HTTP Request failed for POST /api/compare-voices:", err.message);
        terminateServer(1);
    });

    req.write(postData);
    req.end();
}

function terminateServer(exitCode) {
    console.log("Stopping test server...");
    serverProcess.kill('SIGINT');
    setTimeout(() => {
        process.exit(exitCode);
    }, 500);
}
