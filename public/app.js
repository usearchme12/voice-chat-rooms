const socket = io();
const joinOverlay = document.getElementById('join-overlay');
const joinBtn = document.getElementById('join-btn');
const app = document.getElementById('app');
const recordBtn = document.getElementById('record-btn');
const chatStream = document.getElementById('chat-stream');

let audioContext;
let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let audioQueue = [];
let isPlaying = false;
let currentStream = null;
let micSource = null;

// Store messages for replay
const messageStore = new Map();

// Initialize on Join
joinBtn.addEventListener('click', async () => {
    try {
        const callsignInput = document.getElementById('callsign-input');
        const callsign = callsignInput.value.trim().toUpperCase() || 'GUEST-' + Math.floor(1000 + Math.random() * 9000);
        socket.emit('register-callsign', callsign);

        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        setupVisualizer();
        joinOverlay.classList.add('hidden');
        app.classList.remove('hidden');
    } catch (err) {
        console.error('Error starting audio context:', err);
    }
});

// Radio Beep sound synthesizer
function playRadioBeep(isStart) {
    if (!audioContext) return;
    try {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.connect(gain);
        gain.connect(audioContext.destination);

        if (isStart) {
            // High-pitched walkie-talkie activation chirp
            osc.frequency.setValueAtTime(880, audioContext.currentTime); // A5
            gain.gain.setValueAtTime(0.04, audioContext.currentTime);
            osc.start(audioContext.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1200, audioContext.currentTime + 0.1);
            gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.12);
            osc.stop(audioContext.currentTime + 0.12);
        } else {
            // Low-pitched static stop beep
            osc.frequency.setValueAtTime(320, audioContext.currentTime); // E4
            gain.gain.setValueAtTime(0.04, audioContext.currentTime);
            osc.start(audioContext.currentTime);
            osc.frequency.exponentialRampToValueAtTime(160, audioContext.currentTime + 0.15);
            gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.15);
            osc.stop(audioContext.currentTime + 0.15);
        }
    } catch (e) {
        console.error("Error playing radio beep:", e);
    }
}

// Recording interactions (Toggle Mode with Dynamic Warmup)
let detectSignalInterval;
const toggleRecording = async () => {
    if (!isRecording) {
        try {
            // Ensure audio context is running
            if (audioContext.state === 'suspended') await audioContext.resume();

            // Set UI to "Warming up..."
            recordBtn.classList.add('connecting');
            const indicator = document.createElement('div');
            indicator.id = 'recording-indicator';
            indicator.innerHTML = '<span class="neon-text" style="color: #ff9900; text-shadow: 0 0 10px #ff9900;">● CONNECTING MIC...</span>';
            indicator.style.cssText = 'position: absolute; bottom: 100px; font-family: Orbitron; font-size: 0.8rem;';
            recordBtn.parentElement.appendChild(indicator);

            // Start Mic
            currentStream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Connect to visualizer
            micSource = audioContext.createMediaStreamSource(currentStream);
            micSource.connect(window.visualizerAnalyser);

            isRecording = true; // Mark as active to prevent duplicate clicks

            // Dynamic Silence Detection: Check when the ADC begins transmitting audio packets
            const analyser = window.visualizerAnalyser;
            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            const startTime = Date.now();
            let started = false;

            const checkSignal = () => {
                if (!isRecording || started) return;

                analyser.getByteTimeDomainData(dataArray);
                let hasSignal = false;

                // Check if any sample deviates from the digital neutral zero value (128)
                for (let i = 0; i < dataArray.length; i++) {
                    if (Math.abs(dataArray[i] - 128) > 1) {
                        hasSignal = true;
                        break;
                    }
                }

                // If active packets detected or 2.5s maximum fallback limit hit
                if (hasSignal || (Date.now() - startTime > 2500)) {
                    started = true;
                    console.log(`[MicWarmup] Mic signal detected in ${Date.now() - startTime}ms. Initializing recorder...`);

                    // Wait a tiny 250ms safety cushion to let power-on line click stabilize
                    setTimeout(() => {
                        if (isRecording) {
                            let mimeType = 'audio/webm';
                            let options = {};
                            if (typeof MediaRecorder.isTypeSupported === 'function') {
                                if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                                    options = { mimeType: 'audio/webm;codecs=opus' };
                                    mimeType = 'audio/webm';
                                } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
                                    options = { mimeType: 'audio/mp4' };
                                    mimeType = 'audio/mp4';
                                }
                            }

                            audioChunks = [];
                            mediaRecorder = new MediaRecorder(currentStream, options);

                            mediaRecorder.ondataavailable = (e) => {
                                if (e.data.size > 0) audioChunks.push(e.data);
                            };

                            mediaRecorder.onstart = () => {
                                // Play walkie-talkie chirp
                                playRadioBeep(true);

                                // Broadcast transmission start
                                socket.emit('transmitting-start');

                                // Update UI to active recording state
                                recordBtn.classList.remove('connecting');
                                recordBtn.classList.add('recording');
                                indicator.innerHTML = '<span class="neon-text">● TRANSMITTING...</span>';

                                // Auto-stop after 20 seconds
                                setTimeout(() => {
                                    if (isRecording && mediaRecorder && mediaRecorder.state === 'recording') {
                                        toggleRecording();
                                    }
                                }, 20000);
                            };

                            mediaRecorder.onstop = () => {
                                const audioBlob = new Blob(audioChunks, { type: mimeType });
                                const msgId = `msg-${Date.now()}`;

                                // Save for replay
                                messageStore.set(msgId, { blob: audioBlob, mimeType, userId: 'Me' });

                                // Add to UI
                                createVoiceBubble({ userId: 'Me', msgId }, true);

                                socket.emit('audio-chunk', {
                                    blob: audioBlob,
                                    mimeType,
                                    msgId
                                });
                            };

                            mediaRecorder.start();
                        }
                    }, 250);
                } else {
                    detectSignalInterval = requestAnimationFrame(checkSignal);
                }
            };

            detectSignalInterval = requestAnimationFrame(checkSignal);

        } catch (err) {
            console.error('Error starting recording:', err);
            alert('Could not access microphone.');
            isRecording = false;
            recordBtn.classList.remove('connecting');
            const indicator = document.getElementById('recording-indicator');
            if (indicator) indicator.remove();
        }
    } else {
        // Cancel dynamic detection frame if clicked stop early
        cancelAnimationFrame(detectSignalInterval);

        // Broadcast transmission stop
        socket.emit('transmitting-stop');

        // Stop recorder
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
            // Play stop chirp
            playRadioBeep(false);
        }

        // Disconnect and kill tracks
        if (micSource) {
            micSource.disconnect();
            micSource = null;
        }
        if (currentStream) {
            currentStream.getTracks().forEach(track => {
                track.stop();
                console.log('Track stopped:', track.label);
            });
            currentStream = null;
        }

        isRecording = false;
        recordBtn.classList.remove('recording');
        recordBtn.classList.remove('connecting');
        const indicator = document.getElementById('recording-indicator');
        if (indicator) indicator.remove();
    }
};

recordBtn.addEventListener('click', toggleRecording);

socket.on('user-count', (count) => {
    const roomInfo = document.getElementById('room-info');
    if (roomInfo) {
        roomInfo.innerHTML = `<span class="neon-text">${count}</span> SIGNALS DETECTED`;
    }
});

const transmissionBar = document.getElementById('transmission-bar');
const transmissionText = document.getElementById('transmission-text');

socket.on('transmitting-start', (data) => {
    if (transmissionText) {
        transmissionText.textContent = `${data.userId} IS TRANSMITTING...`;
    }
    if (transmissionBar) {
        transmissionBar.classList.remove('hidden');
    }
});

socket.on('transmitting-stop', () => {
    if (transmissionBar) {
        transmissionBar.classList.add('hidden');
    }
});

socket.on('error-msg', (msg) => {
    alert(msg);
    window.location.reload();
});

// Handle incoming audio
socket.on('audio-stream', (data) => {
    // Save for replay (Convert buffer to blob if it's from socket)
    const blob = data.blob instanceof Blob ? data.blob : new Blob([data.blob], { type: data.mimeType });
    messageStore.set(data.msgId, { ...data, blob });

    createVoiceBubble(data, false);

    // Auto-queue for first play
    audioQueue.push(data.msgId);
    if (!isPlaying) {
        playNextInQueue();
    }
});

async function playNextInQueue() {
    if (audioQueue.length === 0) {
        isPlaying = false;
        return;
    }

    const msgId = audioQueue.shift();
    await playMessage(msgId, true); // true = continue to next in queue after finish
}

async function playMessage(msgId, autoContinue = false) {
    console.log(`[playMessage] Triggered for message: ${msgId}`);
    const start = performance.now();
    const data = messageStore.get(msgId);
    if (!data) {
        console.error(`[playMessage] No data found in store for: ${msgId}`);
        return;
    }

    if (isPlaying && !autoContinue) {
        // If user manually clicked, we might want to stop current? 
        // For now, let's just play.
    }

    isPlaying = true;

    try {
        if (audioContext.state === 'suspended') {
            console.log("[playMessage] AudioContext is suspended. Resuming...");
            const resumeStart = performance.now();
            await audioContext.resume();
            console.log(`[playMessage] AudioContext resumed in ${(performance.now() - resumeStart).toFixed(1)}ms`);
        }

        let audioBuffer = data.audioBuffer;
        if (!audioBuffer) {
            console.log("[playMessage] Audio buffer was NOT pre-decoded. Running fallback decoder...");
            const decodeStart = performance.now();
            const arrayBuffer = await data.blob.arrayBuffer();
            audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            data.audioBuffer = audioBuffer;
            console.log(`[playMessage] Fallback decoding finished in ${(performance.now() - decodeStart).toFixed(1)}ms`);
        } else {
            console.log("[playMessage] Using cached pre-decoded AudioBuffer!");
        }

        // Measure leading silence in the decoded audio buffer
        const channelData = audioBuffer.getChannelData(0);
        let firstSoundIndex = -1;
        for (let i = 0; i < channelData.length; i++) {
            if (Math.abs(channelData[i]) > 0.01) {
                firstSoundIndex = i;
                break;
            }
        }
        const leadingSilence = firstSoundIndex === -1 ? audioBuffer.duration : firstSoundIndex / audioBuffer.sampleRate;
        console.log(`[playMessage] Buffer Duration: ${audioBuffer.duration.toFixed(2)}s | Leading Silence: ${leadingSilence.toFixed(2)}s`);

        let startOffset = leadingSilence;
        // If the silence is less than 100ms, don't bother skipping
        if (startOffset < 0.1) {
            startOffset = 0;
        }
        // If the file is mostly silent, don't skip to the very end
        if (startOffset >= audioBuffer.duration - 0.1) {
            startOffset = 0;
        }

        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;

        // Connect to visualizer and speakers in parallel (prevents cumulative distortion)
        source.connect(window.visualizerAnalyser);
        source.connect(audioContext.destination);

        const bubble = document.querySelector(`[data-msg-id="${msgId}"]`);
        if (bubble) {
            bubble.classList.add('playing');
            bubble.scrollIntoView({ behavior: 'smooth', block: 'center' });
            updateProgressBar(bubble, audioBuffer.duration - startOffset);
        }

        source.onended = () => {
            console.log(`[playMessage] Audio playback finished for: ${msgId}`);
            if (bubble) {
                bubble.classList.remove('playing');
                // Reset all waveform bars to empty
                const bars = bubble.querySelectorAll('.waveform-bar');
                bars.forEach(bar => bar.classList.remove('filled'));
            }
            if (autoContinue) {
                playNextInQueue();
            } else {
                isPlaying = false;
            }
        };

        console.log(`[playMessage] Invoking source.start() with offset ${startOffset.toFixed(2)}s at ${(performance.now() - start).toFixed(1)}ms from click`);
        source.start(0, startOffset);
    } catch (e) {
        console.error('Error playing audio:', e);
        if (autoContinue) playNextInQueue();
        else isPlaying = false;
    }
}

// Generates waveform HTML from audio buffer peaks
function generateWaveformHTML(audioBuffer, numBars = 25) {
    const channelData = audioBuffer.getChannelData(0);
    const blockSize = Math.floor(channelData.length / numBars);
    let html = '<div class="waveform-bars">';
    let maxVal = 0.01;
    const peaks = [];

    for (let i = 0; i < numBars; i++) {
        let max = 0;
        const start = i * blockSize;
        for (let j = 0; j < blockSize; j++) {
            const val = Math.abs(channelData[start + j]);
            if (val > max) max = val;
        }
        peaks.push(max);
        if (max > maxVal) maxVal = max;
    }

    for (let i = 0; i < numBars; i++) {
        const heightPercent = Math.max(10, Math.min(100, (peaks[i] / maxVal) * 100));
        html += `<div class="waveform-bar" style="height: ${heightPercent}%;" data-bar-index="${i}"></div>`;
    }
    html += '</div>';
    return html;
}

// Background asynchronous waveform builder
async function attachWaveform(msgId, data) {
    try {
        let audioBuffer = data.audioBuffer;
        if (!audioBuffer) {
            const arrayBuffer = await data.blob.arrayBuffer();
            audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            data.audioBuffer = audioBuffer;
        }
        const bubble = document.querySelector(`[data-msg-id="${msgId}"]`);
        if (bubble) {
            const container = bubble.querySelector('.progress-container');
            if (container) {
                container.innerHTML = generateWaveformHTML(audioBuffer);
            }
        }
    } catch (e) {
        console.error("Error generating waveform for bubble:", e);
    }
}

function updateProgressBar(bubble, duration) {
    const bars = bubble.querySelectorAll('.waveform-bar');
    if (bars.length === 0) return;

    let start = null;
    const animate = (timestamp) => {
        if (!start) start = timestamp;
        const elapsed = (timestamp - start) / 1000;
        const progress = Math.min(elapsed / duration, 1.0);

        // Color the bars up to the progress percentage
        const activeCount = Math.floor(progress * bars.length);
        bars.forEach((bar, index) => {
            if (index < activeCount) {
                bar.classList.add('filled');
            } else {
                bar.classList.remove('filled');
            }
        });

        if (progress < 1 && bubble.classList.contains('playing')) {
            requestAnimationFrame(animate);
        }
    };
    requestAnimationFrame(animate);
}

function createVoiceBubble(data, isSent) {
    const wrapper = document.createElement('div');
    wrapper.className = `message-wrapper ${isSent ? 'sent' : 'received'}`;

    const bubble = document.createElement('div');
    bubble.className = 'voice-bubble';
    bubble.dataset.msgId = data.msgId;
    bubble.style.cursor = 'pointer'; // Make it look clickable

    bubble.innerHTML = `
        <div class="bubble-header">
            <span>${isSent ? 'YOU' : 'VOICE FROM ' + data.userId.substring(0, 6)}</span>
            <span>${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div class="audio-controls">
            <div class="play-icon">
                <svg viewBox="0 0 24 24" width="16" height="16">
                    <path fill="currentColor" d="M8 5v14l11-7z"/>
                </svg>
            </div>
            <div class="progress-container">
                <!-- Loading Waveform animation placeholder -->
                <div style="font-size: 0.7rem; opacity: 0.5; font-family: monospace;">LOADING WAVEFORM...</div>
            </div>
        </div>
    `;

    // Add click listener for replay
    bubble.addEventListener('click', () => {
        playMessage(data.msgId, false);
    });

    wrapper.appendChild(bubble);
    chatStream.appendChild(wrapper);
    chatStream.scrollTop = chatStream.scrollHeight;

    // Trigger async waveform generation
    const dataObj = messageStore.get(data.msgId);
    if (dataObj) {
        attachWaveform(data.msgId, dataObj);
    }
}

function setupVisualizer() {
    const canvas = document.getElementById('visualizer');
    const ctx = canvas.getContext('2d');
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    window.visualizerAnalyser = analyser;

    const draw = () => {
        requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const barWidth = (canvas.width / bufferLength) * 2;
        let x = 0;
        for (let i = 0; i < bufferLength; i++) {
            const barHeight = dataArray[i] / 2;
            ctx.fillStyle = `rgba(0, 242, 255, ${barHeight / 100})`;
            ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
            x += barWidth + 1;
        }
    };
    draw();
}
