/**
 * World of Chat - Voice Rooms (Front-End Application Engine)
 * Low-latency push-to-talk with dynamic warmup, waveforms, and Render sleep wake-up detection.
 */

(function() {
    'use strict';

    // Safe Storage Helper (Never throws in Safari Private Mode or locked WebKit storage)
    const safeStorage = {
        get: function(key) {
            try {
                return window.localStorage ? window.localStorage.getItem(key) : null;
            } catch (e) {
                return null;
            }
        },
        set: function(key, val) {
            try {
                if (window.localStorage) window.localStorage.setItem(key, val);
            } catch (e) {}
        }
    };

    function initAll() {
        const widgets = document.querySelectorAll('.woc-voice-widget:not([data-woc-ready])');
        widgets.forEach(widgetEl => {
            widgetEl.setAttribute('data-woc-ready', '1');
            initVoiceWidget(widgetEl);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAll);
    } else {
        initAll();
    }
    window.addEventListener('load', initAll);
    setTimeout(initAll, 100);
    setTimeout(initAll, 500);

    function initVoiceWidget(container) {
        const instanceId = container.dataset.instanceId || '1';
        const configKey = 'wocVoiceConfig_' + instanceId;
        const config = window[configKey] || {
            serverUrl: 'https://voice.worldofchat.co.uk',
            maxSeconds: 30,
            soundEffects: true,
            currentUser: { isLoggedIn: false, displayName: '' }
        };

        // DOM Elements
        const joinOverlay       = container.querySelector('.woc-join-overlay');
        const enterBtn          = container.querySelector('.woc-enter-btn');
        const callsignInput     = container.querySelector('.woc-callsign-input');
        const appBody           = container.querySelector('.woc-app-body');
        const statusDot         = container.querySelector('.woc-status-dot');
        const statusText        = container.querySelector('.woc-status-text');
        const userCount         = container.querySelector('.woc-user-count');
        const speakersCount     = container.querySelector('.woc-speakers-count');
        const wakingBanner      = container.querySelector('.woc-server-waking-banner');
        const transmissionHud   = container.querySelector('.woc-transmission-hud');
        const hudText           = container.querySelector('.woc-hud-text');
        const chatStream        = container.querySelector('.woc-chat-stream');
        const streamEmpty       = container.querySelector('.woc-stream-empty');
        const micBtn            = container.querySelector('.woc-mic-btn');
        const discardBtn        = container.querySelector('.woc-discard-btn');
        const micStatusLabel    = container.querySelector('.woc-mic-status-label');
        const micTimerLabel     = container.querySelector('.woc-mic-timer-label');
        const timerRingProgress = container.querySelector('.woc-timer-ring-progress');
        const canvas            = container.querySelector('.woc-visualizer-canvas');

        // State Variables
        let socket = null;
        let audioContext = null;
        let visualizerAnalyser = null;
        let mediaRecorder = null;
        let currentStream = null;
        let micSource = null;
        let currentPlayingSource = null;
        let audioChunks = [];
        let isRecording = false;
        let isPlaying = false;
        let audioQueue = [];
        let activeSpeakers = new Set();
        let serverSpeakerCount = 0;
        let detectSignalInterval = null;
        let recordingTimerInterval = null;
        let recordingSecondsElapsed = 0;
        let maxDuration = config.maxSeconds || 30;
        const ringCircumference = 2 * Math.PI * 38; // 238.76

        // Message Audio Store
        const messageStore = new Map();

        // Restore saved callsign if available
        const savedCallsign = safeStorage.get('woc_vr_callsign');
        if (savedCallsign && !callsignInput.value) {
            callsignInput.value = savedCallsign;
        }

        // Render initial persistent messages from WordPress storage
        if (Array.isArray(config.initialHistory) && config.initialHistory.length > 0) {
            config.initialHistory.forEach(item => {
                if (!messageStore.has(item.msgId)) {
                    messageStore.set(item.msgId, item);
                    const myCallsign = (callsignInput ? callsignInput.value.trim().toUpperCase() : '');
                    const isMe = item.userId && myCallsign && (item.userId === myCallsign);
                    createVoiceBubble(item, isMe);
                }
            });
        }

        // ======================================================================
        // Socket.io Connection & Server Wake-up Handling
        // ======================================================================
        let serverWakeTimer = setTimeout(() => {
            if (wakingBanner && (!socket || !socket.connected)) {
                wakingBanner.classList.remove('woc-hidden');
            }
        }, 3500);

        try {
            if (typeof io !== 'undefined') {
                socket = io(config.serverUrl, {
                    reconnectionAttempts: 15,
                    reconnectionDelay: 2000,
                    timeout: 20000
                });

                socket.on('connect', () => {
                    clearTimeout(serverWakeTimer);
                    if (wakingBanner) wakingBanner.classList.add('woc-hidden');
                    if (statusDot) {
                        statusDot.className = 'woc-status-dot woc-status-connected';
                    }
                    if (statusText) statusText.textContent = 'FREQUENCY ONLINE';
                    console.log('[WOC Voice] Connected to server:', config.serverUrl);
                    const activeCallsign = (callsignInput ? callsignInput.value.trim().toUpperCase() : '') || safeStorage.get('woc_vr_callsign');
                    if (activeCallsign) {
                        try { socket.emit('register-callsign', activeCallsign); } catch(e){}
                    }
                });

                socket.on('disconnect', () => {
                    if (statusDot) statusDot.className = 'woc-status-dot woc-status-offline';
                    if (statusText) statusText.textContent = 'DISCONNECTED (RECONNECTING...)';
                });

                socket.on('connect_error', () => {
                    if (statusDot) statusDot.className = 'woc-status-dot woc-status-connecting';
                    if (statusText) statusText.textContent = 'CONNECTING TO FREQUENCY...';
                });

                socket.on('user-count', (count) => {
                    if (userCount) {
                        userCount.textContent = `${count} ONLINE`;
                        userCount.classList.remove('woc-hidden');
                    }
                });

                socket.on('speakers-count', (count) => {
                    serverSpeakerCount = count;
                    updateSpeakersDisplay();
                });

                socket.on('transmitting-start', (data) => {
                    if (hudText) hudText.textContent = `${data.userId || 'TRANSMISSION'} IS TRANSMITTING...`;
                    if (transmissionHud) transmissionHud.classList.remove('woc-hidden');
                });

                socket.on('transmitting-stop', () => {
                    if (transmissionHud) transmissionHud.classList.add('woc-hidden');
                });

                socket.on('audio-stream', (data) => {
                    if (!data.timestamp) data.timestamp = Date.now();
                    const blob = data.blob instanceof Blob ? data.blob : new Blob([data.blob], { type: data.mimeType });
                    messageStore.set(data.msgId, { ...data, blob });

                    createVoiceBubble(data, false);

                    audioQueue.push(data.msgId);
                    if (!isPlaying) {
                        playNextInQueue();
                    }
                });

                // Message History: Load past transmissions when joining a room
                socket.on('message-history', (history) => {
                    if (!Array.isArray(history) || history.length === 0) return;
                    const myCallsign = (callsignInput ? callsignInput.value.trim().toUpperCase() : '');
                    history.forEach((data) => {
                        if (messageStore.has(data.msgId)) return;

                        const blob = data.blob instanceof Blob ? data.blob : new Blob([data.blob], { type: data.mimeType });
                        messageStore.set(data.msgId, { ...data, blob });

                        const isMe = data.userId === myCallsign;
                        createVoiceBubble(data, isMe);
                    });
                    setTimeout(renderAllPendingWaveforms, 100);
                });

                socket.on('delete-msg', (data) => {
                    if (data && data.msgId) {
                        deleteMessage(data.msgId, false);
                    }
                });

                socket.on('error-msg', (msg) => {
                    alert(msg);
                });
            }
        } catch (e) {
            console.error('[WOC Voice] Socket init error:', e);
        }

        // ======================================================================
        // Enter Room & Unlock AudioContext (Mobile Touch & Click)
        // ======================================================================
        let hasEntered = false;
        const handleEnterRoom = async (e) => {
            if (hasEntered) return;
            if (e && e.type === 'touchend' && typeof e.preventDefault === 'function') {
                e.preventDefault();
            }

            console.log('[WOC Voice] Entering room...');

            // Dismiss mobile virtual keyboard if open
            if (callsignInput) {
                try { callsignInput.blur(); } catch(err){}
            }

            let callsign = '';
            if (callsignInput) {
                callsign = callsignInput.value.trim().toUpperCase();
            }
            if (!callsign) {
                callsign = 'GUEST-' + Math.floor(1000 + Math.random() * 9000);
                if (callsignInput) callsignInput.value = callsign;
            }
            safeStorage.set('woc_vr_callsign', callsign);

            if (socket) {
                try {
                    socket.emit('register-callsign', callsign);
                } catch(err) {}
            }

            // CRITICAL: IMMEDIATELY HIDE OVERLAY & SHOW APP SO USER IS NEVER STUCK
            if (joinOverlay) joinOverlay.classList.add('woc-hidden');
            if (appBody) appBody.classList.remove('woc-hidden');
            container.setAttribute('data-woc-entered', '1');
            hasEntered = true;

            // Unlock AudioContext safely within this user gesture
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (AudioCtx) {
                    if (!audioContext) audioContext = new AudioCtx();
                    if (audioContext.state === 'suspended') {
                        audioContext.resume().catch(() => {});
                    }
                    // Play a 1-sample silent buffer to permanently unlock iOS WebKit audio playback
                    const silentBuf = audioContext.createBuffer(1, 1, 22050);
                    const silentSrc = audioContext.createBufferSource();
                    silentSrc.buffer = silentBuf;
                    silentSrc.connect(audioContext.destination);
                    silentSrc.start(0);
                }
            } catch (err) {
                console.warn('[WOC Voice] AudioContext resume warning:', err);
            }

            try {
                setupVisualizer();
            } catch (visErr) {
                console.warn('[WOC Voice] Visualizer error:', visErr);
            }

            try {
                setTimeout(renderAllPendingWaveforms, 50);
            } catch(e) {}
        };

        if (enterBtn) {
            enterBtn.addEventListener('click', handleEnterRoom);
            enterBtn.addEventListener('touchend', handleEnterRoom);
        }
        window.wocHandleEnterRoom = handleEnterRoom;

        // Auto-enter if user already tapped button before script initialized
        if (container.getAttribute('data-woc-entered') === '1' || (joinOverlay && joinOverlay.classList.contains('woc-hidden'))) {
            handleEnterRoom();
        }

        // ======================================================================
        // Synthesizer Sound Effects (Walkie-Talkie Radio Chirps)
        // ======================================================================
        function playRadioBeep(isStart) {
            if (!config.soundEffects || !audioContext) return;
            try {
                const osc = audioContext.createOscillator();
                const gain = audioContext.createGain();
                osc.connect(gain);
                gain.connect(audioContext.destination);

                if (isStart) {
                    // High-pitched walkie-talkie activation chirp
                    osc.frequency.setValueAtTime(880, audioContext.currentTime);
                    gain.gain.setValueAtTime(0.05, audioContext.currentTime);
                    osc.start(audioContext.currentTime);
                    osc.frequency.exponentialRampToValueAtTime(1250, audioContext.currentTime + 0.09);
                    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.11);
                    osc.stop(audioContext.currentTime + 0.11);
                } else {
                    // Low-pitched static cutoff chirp
                    osc.frequency.setValueAtTime(340, audioContext.currentTime);
                    gain.gain.setValueAtTime(0.05, audioContext.currentTime);
                    osc.start(audioContext.currentTime);
                    osc.frequency.exponentialRampToValueAtTime(160, audioContext.currentTime + 0.13);
                    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.13);
                    osc.stop(audioContext.currentTime + 0.13);
                }
            } catch (e) {
                console.error('[WOC Voice] Radio chirp error:', e);
            }
        }

        // ======================================================================
        // Push-to-Talk Recording & Countdown Ring
        // ======================================================================
        const updateTimerRing = (progressPercent) => {
            if (!timerRingProgress) return;
            const offset = ringCircumference - (progressPercent * ringCircumference);
            timerRingProgress.style.strokeDashoffset = offset;
        };

        const resetTimerRing = () => {
            if (!timerRingProgress) return;
            timerRingProgress.style.strokeDashoffset = ringCircumference;
        };

        const startCountdown = () => {
            recordingSecondsElapsed = 0;
            resetTimerRing();
            micTimerLabel.classList.remove('woc-hidden');
            micTimerLabel.textContent = `00:${maxDuration.toString().padStart(2, '0')}`;

            recordingTimerInterval = setInterval(() => {
                recordingSecondsElapsed += 0.1;
                const remaining = Math.max(0, maxDuration - recordingSecondsElapsed);
                const wholeSecs = Math.ceil(remaining);
                micTimerLabel.textContent = `00:${wholeSecs.toString().padStart(2, '0')}`;

                const progress = Math.min(1.0, recordingSecondsElapsed / maxDuration);
                updateTimerRing(progress);

                if (recordingSecondsElapsed >= maxDuration) {
                    clearInterval(recordingTimerInterval);
                    if (isRecording) {
                        toggleRecording();
                    }
                }
            }, 100);
        };

        const stopCountdown = () => {
            clearInterval(recordingTimerInterval);
            micTimerLabel.classList.add('woc-hidden');
            resetTimerRing();
        };

        const toggleRecording = async () => {
            if (!isRecording) {
                try {
                    if (audioContext) {
                        if (audioContext.state === 'suspended') {
                            await audioContext.resume();
                        }
                        try {
                            const silentBuf = audioContext.createBuffer(1, 1, 22050);
                            const silentSrc = audioContext.createBufferSource();
                            silentSrc.buffer = silentBuf;
                            silentSrc.connect(audioContext.destination);
                            silentSrc.start(0);
                        } catch(e) {}
                    }

                    micBtn.classList.add('connecting');
                    micStatusLabel.textContent = 'CONNECTING MIC...';

                    currentStream = await navigator.mediaDevices.getUserMedia({ audio: true });

                    if (audioContext && visualizerAnalyser) {
                        micSource = audioContext.createMediaStreamSource(currentStream);
                        micSource.connect(visualizerAnalyser);
                    }

                    isRecording = true;

                    // Dynamic Mic Warmup: Wait for ADC hardware line signal
                    const analyser = visualizerAnalyser;
                    const dataArray = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
                    const startTime = Date.now();
                    let started = false;

                    const checkSignal = () => {
                        if (!isRecording || started) return;

                        let hasSignal = false;
                        if (analyser && dataArray) {
                            analyser.getByteTimeDomainData(dataArray);
                            for (let i = 0; i < dataArray.length; i++) {
                                if (Math.abs(dataArray[i] - 128) > 1) {
                                    hasSignal = true;
                                    break;
                                }
                            }
                        }

                        // Start when signal detected or 2.2s fallback limit reached
                        if (hasSignal || (Date.now() - startTime > 2200)) {
                            started = true;
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
                                        playRadioBeep(true);
                                        if (socket) socket.emit('transmitting-start');

                                        micBtn.classList.remove('connecting');
                                        micBtn.classList.add('recording');
                                        if (discardBtn) discardBtn.classList.remove('woc-hidden');
                                        micStatusLabel.textContent = 'TRANSMITTING...';
                                        startCountdown();
                                    };

                                    mediaRecorder.onstop = () => {
                                        stopCountdown();
                                        if (discardBtn) discardBtn.classList.add('woc-hidden');
                                        const now = Date.now();
                                        const msgId = `msg-${now}`;
                                        const myCallsign = (callsignInput ? callsignInput.value.trim().toUpperCase() : '') || 'ANONYMOUS';
                                        const audioBlob = new Blob(audioChunks, { type: mimeType });

                                        messageStore.set(msgId, { blob: audioBlob, mimeType, userId: 'Me', timestamp: now });
                                        createVoiceBubble({ userId: 'Me', msgId, timestamp: now }, true);

                                        if (socket) {
                                            socket.emit('audio-chunk', {
                                                blob: audioBlob,
                                                mimeType,
                                                msgId,
                                                timestamp: now
                                            });
                                        }

                                        // Persist to WordPress storage so notes never disappear
                                        if (config.ajaxUrl) {
                                            try {
                                                const fd = new FormData();
                                                fd.append('action', 'woc_save_voice_note');
                                                if (config.nonce) fd.append('nonce', config.nonce);
                                                fd.append('audio', audioBlob, `${msgId}.${mimeType.includes('mp4') ? 'mp4' : 'webm'}`);
                                                fd.append('msg_id', msgId);
                                                fd.append('user_id', myCallsign);
                                                fd.append('mime_type', mimeType);
                                                fetch(config.ajaxUrl, { method: 'POST', body: fd }).catch(() => {});
                                            } catch(e) {}
                                        }
                                    };

                                    mediaRecorder.start();
                                }
                            }, 200);
                        } else {
                            detectSignalInterval = requestAnimationFrame(checkSignal);
                        }
                    };

                    detectSignalInterval = requestAnimationFrame(checkSignal);

                } catch (err) {
                    console.error('[WOC Voice] Mic access error:', err);
                    alert('Could not access microphone. Please allow microphone permissions.');
                    isRecording = false;
                    micBtn.classList.remove('connecting');
                    if (discardBtn) discardBtn.classList.add('woc-hidden');
                    micStatusLabel.textContent = 'TAP MIC TO TRANSMIT';
                    stopCountdown();
                }
            } else {
                // Stop Recording Normally & Send
                cancelAnimationFrame(detectSignalInterval);
                stopCountdown();

                if (socket) socket.emit('transmitting-stop');

                if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                    mediaRecorder.stop();
                    playRadioBeep(false);
                }

                if (micSource) {
                    micSource.disconnect();
                    micSource = null;
                }

                if (currentStream) {
                    currentStream.getTracks().forEach(track => track.stop());
                    currentStream = null;
                }

                isRecording = false;
                micBtn.classList.remove('recording', 'connecting');
                if (discardBtn) discardBtn.classList.add('woc-hidden');
                micStatusLabel.textContent = 'TAP MIC TO TRANSMIT';
            }
        };

        const discardRecording = () => {
            if (!isRecording) return;
            console.log('[WOC Voice] Discarding recording...');
            cancelAnimationFrame(detectSignalInterval);
            stopCountdown();

            if (socket) socket.emit('transmitting-stop');

            if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                // Remove handlers so it doesn't emit or add to stream
                mediaRecorder.ondataavailable = null;
                mediaRecorder.onstop = null;
                try { mediaRecorder.stop(); } catch(e){}
                playRadioBeep(false);
            }

            if (micSource) {
                micSource.disconnect();
                micSource = null;
            }

            if (currentStream) {
                currentStream.getTracks().forEach(track => track.stop());
                currentStream = null;
            }

            isRecording = false;
            micBtn.classList.remove('recording', 'connecting');
            if (discardBtn) discardBtn.classList.add('woc-hidden');
            micStatusLabel.textContent = 'TRANSMISSION DISCARDED';
            setTimeout(() => {
                if (!isRecording) micStatusLabel.textContent = 'TAP MIC TO TRANSMIT';
            }, 1800);
        };

        micBtn.addEventListener('click', toggleRecording);
        if (discardBtn) {
            discardBtn.addEventListener('click', discardRecording);
        }

        // ======================================================================
        // Message Bubbles, Silence Trimming & Waveform Rendering
        // ======================================================================
        function formatMessageDate(data) {
            let ts = null;
            if (data && data.timestamp) {
                ts = Number(data.timestamp);
                if (ts < 10000000000) {
                    ts = ts * 1000;
                }
            } else if (data && data.msgId && typeof data.msgId === 'string' && data.msgId.startsWith('msg-')) {
                const parsed = parseInt(data.msgId.replace('msg-', ''), 10);
                if (!isNaN(parsed) && parsed > 1000000000000) {
                    ts = parsed;
                }
            }

            if (!ts) {
                return 'Just now';
            }

            const msgDate = new Date(ts);
            const now = new Date();

            const isToday = msgDate.toDateString() === now.toDateString();

            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            const isYesterday = msgDate.toDateString() === yesterday.toDateString();

            const timeStr = msgDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

            if (isToday) {
                return `Today, ${timeStr}`;
            } else if (isYesterday) {
                return `Yesterday, ${timeStr}`;
            } else {
                const dateStr = msgDate.toLocaleDateString([], { day: 'numeric', month: 'short' });
                return `${dateStr}, ${timeStr}`;
            }
        }

        function createVoiceBubble(data, isSent) {
            if (streamEmpty) {
                streamEmpty.classList.add('woc-hidden');
            }

            const wrap = document.createElement('div');
            wrap.className = `woc-msg-wrap ${isSent ? 'sent' : 'received'}`;

            const bubble = document.createElement('div');
            bubble.className = 'woc-voice-bubble';
            bubble.dataset.msgId = data.msgId;

            const timeStr = formatMessageDate(data);
            const senderName = isSent ? 'YOU' : (data.userId || 'VOICE NOTE');

            bubble.innerHTML = `
                <div class="woc-bubble-meta">
                    <span class="woc-bubble-sender">${senderName}</span>
                    <div class="woc-bubble-actions">
                        <span class="woc-bubble-time">${timeStr}</span>
                        ${isSent ? `
                            <button type="button" class="woc-delete-msg-btn" title="Delete message" aria-label="Delete message">
                                <svg viewBox="0 0 24 24" width="14" height="14">
                                    <path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                                </svg>
                            </button>
                        ` : ''}
                    </div>
                </div>
                <div class="woc-audio-row">
                    <div class="woc-play-pill">
                        <svg viewBox="0 0 24 24" width="16" height="16">
                            <path fill="currentColor" d="M8 5v14l11-7z"/>
                        </svg>
                    </div>
                    <div class="woc-waveform-box">
                        <div class="woc-waveform-bars">
                            <span style="font-size: 0.72rem; color: var(--woc-text-muted);">Processing waveform...</span>
                        </div>
                    </div>
                </div>
            `;

            // If sent, attach delete handler
            if (isSent) {
                const deleteBtn = bubble.querySelector('.woc-delete-msg-btn');
                if (deleteBtn) {
                    deleteBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        deleteMessage(data.msgId, true);
                    });
                }
            }

            bubble.addEventListener('click', () => {
                playMessage(data.msgId, false);
            });

            wrap.appendChild(bubble);
            chatStream.appendChild(wrap);
            chatStream.scrollTop = chatStream.scrollHeight;

            const dataObj = messageStore.get(data.msgId);
            if (dataObj) {
                attachWaveform(data.msgId, dataObj, bubble);
            }

            // Track active speaker
            activeSpeakers.add(senderName);
            updateSpeakersDisplay();
        }

        function updateSpeakersDisplay() {
            if (!speakersCount) return;
            const count = Math.max(activeSpeakers.size, serverSpeakerCount || 0);
            if (count > 0) {
                speakersCount.textContent = `${count} SPEAKER${count === 1 ? '' : 'S'}`;
                speakersCount.classList.remove('woc-hidden');
            } else {
                speakersCount.classList.add('woc-hidden');
            }
        }

        function deleteMessage(msgId, emitSocket = false) {
            if (emitSocket && socket) {
                socket.emit('delete-msg', { msgId });
            }

            if (emitSocket && config.ajaxUrl) {
                try {
                    const fd = new FormData();
                    fd.append('action', 'woc_delete_voice_note');
                    if (config.nonce) fd.append('nonce', config.nonce);
                    fd.append('msg_id', msgId);
                    fetch(config.ajaxUrl, { method: 'POST', body: fd }).catch(() => {});
                } catch(e) {}
            }

            messageStore.delete(msgId);

            const bubble = container.querySelector(`[data-msg-id="${msgId}"]`);
            if (bubble) {
                // If this message was playing, stop audio immediately
                if (bubble.classList.contains('playing') && currentPlayingSource) {
                    try { currentPlayingSource.stop(); } catch(e){}
                    currentPlayingSource = null;
                    isPlaying = false;
                }

                const wrap = bubble.closest('.woc-msg-wrap');
                if (wrap) {
                    wrap.classList.add('woc-fade-out');
                    setTimeout(() => {
                        wrap.remove();
                        checkEmptyStream();
                        recalculateSpeakers();
                    }, 260);
                }
            }
        }

        function recalculateSpeakers() {
            const remaining = new Set();
            chatStream.querySelectorAll('.woc-bubble-sender').forEach(el => {
                const name = el.textContent.trim();
                if (name) remaining.add(name);
            });
            activeSpeakers = remaining;
            updateSpeakersDisplay();
        }

        function checkEmptyStream() {
            const bubbles = chatStream.querySelectorAll('.woc-voice-bubble');
            if (bubbles.length === 0 && streamEmpty) {
                streamEmpty.classList.remove('woc-hidden');
            }
        }

        async function attachWaveform(msgId, data, bubbleEl) {
            try {
                if (!audioContext) return;
                let audioBuffer = data.audioBuffer;
                if (!audioBuffer) {
                    if (!data.blob && data.url) {
                        try {
                            const resp = await fetch(data.url);
                            if (resp.ok) {
                                const cType = resp.headers.get('content-type') || '';
                                if (!cType.includes('text/html')) {
                                    data.blob = await resp.blob();
                                }
                            }
                        } catch(e) {}
                    }
                    if (!data.blob) {
                        const wrap = bubbleEl.closest('.woc-msg-wrap');
                        if (wrap) wrap.remove();
                        checkEmptyStream();
                        recalculateSpeakers();
                        return;
                    }
                    const arrayBuffer = await data.blob.arrayBuffer();
                    audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                    data.audioBuffer = audioBuffer;
                }

                const waveContainer = bubbleEl.querySelector('.woc-waveform-box');
                if (waveContainer) {
                    waveContainer.innerHTML = generateWaveformHTML(audioBuffer, 24);
                }
            } catch (e) {
                console.error('[WOC Voice] Waveform creation error:', e);
            }
        }

        function renderAllPendingWaveforms() {
            if (!audioContext) return;
            messageStore.forEach((dataObj, msgId) => {
                const bubble = container.querySelector(`[data-msg-id="${msgId}"]`);
                if (bubble) {
                    const waveBox = bubble.querySelector('.woc-waveform-box');
                    if (waveBox && !waveBox.querySelector('.woc-waveform-bar')) {
                        attachWaveform(msgId, dataObj, bubble);
                    }
                }
            });
        }

        function generateWaveformHTML(audioBuffer, numBars = 24) {
            const channelData = audioBuffer.getChannelData(0);
            const blockSize = Math.floor(channelData.length / numBars);
            let html = '<div class="woc-waveform-bars">';
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
                const heightPercent = Math.max(15, Math.min(100, (peaks[i] / maxVal) * 100));
                html += `<div class="woc-waveform-bar" style="height: ${heightPercent}%;" data-idx="${i}"></div>`;
            }
            html += '</div>';
            return html;
        }

        async function playNextInQueue() {
            if (audioQueue.length === 0) {
                isPlaying = false;
                return;
            }
            const nextMsgId = audioQueue.shift();
            await playMessage(nextMsgId, true);
        }

        async function playMessage(msgId, autoContinue = false) {
            const data = messageStore.get(msgId);
            if (!data) return;

            isPlaying = true;

            try {
                if (audioContext && audioContext.state === 'suspended') {
                    await audioContext.resume();
                }

                let audioBuffer = data.audioBuffer;
                if (!audioBuffer) {
                    if (!data.blob && data.url) {
                        try {
                            const resp = await fetch(data.url);
                            if (resp.ok) {
                                const cType = resp.headers.get('content-type') || '';
                                if (!cType.includes('text/html')) {
                                    data.blob = await resp.blob();
                                }
                            }
                        } catch(e) {}
                    }
                    if (!data.blob) return;
                    const arrayBuffer = await data.blob.arrayBuffer();
                    audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                    data.audioBuffer = audioBuffer;
                }

                // Playback Silence Trimming: Scan channel data in <10ms to skip leading silence
                const channelData = audioBuffer.getChannelData(0);
                let firstSoundIndex = -1;
                for (let i = 0; i < channelData.length; i++) {
                    if (Math.abs(channelData[i]) > 0.015) {
                        firstSoundIndex = i;
                        break;
                    }
                }
                const leadingSilence = firstSoundIndex === -1 ? 0 : firstSoundIndex / audioBuffer.sampleRate;
                let startOffset = leadingSilence;
                if (startOffset < 0.1 || startOffset >= audioBuffer.duration - 0.1) {
                    startOffset = 0;
                }

                const source = audioContext.createBufferSource();
                source.buffer = audioBuffer;
                currentPlayingSource = source;

                if (visualizerAnalyser) source.connect(visualizerAnalyser);
                source.connect(audioContext.destination);

                const bubble = container.querySelector(`[data-msg-id="${msgId}"]`);
                if (bubble) {
                    bubble.classList.add('playing');
                    bubble.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    animatePlaybackBars(bubble, audioBuffer.duration - startOffset);
                }

                source.onended = () => {
                    currentPlayingSource = null;
                    if (bubble) {
                        bubble.classList.remove('playing');
                        const bars = bubble.querySelectorAll('.woc-waveform-bar');
                        bars.forEach(b => b.classList.remove('filled'));
                    }
                    if (autoContinue) {
                        playNextInQueue();
                    } else {
                        isPlaying = false;
                    }
                };

                source.start(0, startOffset);

            } catch (err) {
                console.error('[WOC Voice] Playback error:', err);
                currentPlayingSource = null;
                if (autoContinue) playNextInQueue();
                else isPlaying = false;
            }
        }

        function animatePlaybackBars(bubble, duration) {
            const bars = bubble.querySelectorAll('.woc-waveform-bar');
            if (bars.length === 0) return;

            let startTime = null;
            const step = (timestamp) => {
                if (!startTime) startTime = timestamp;
                const elapsed = (timestamp - startTime) / 1000;
                const progress = Math.min(1.0, elapsed / duration);
                const activeCount = Math.floor(progress * bars.length);

                bars.forEach((bar, idx) => {
                    if (idx < activeCount) bar.classList.add('filled');
                    else bar.classList.remove('filled');
                });

                if (progress < 1 && bubble.classList.contains('playing')) {
                    requestAnimationFrame(step);
                }
            };
            requestAnimationFrame(step);
        }

        // ======================================================================
        // Visualizer Canvas Background
        // ======================================================================
        function setupVisualizer() {
            if (!canvas || !audioContext) return;
            const ctx = canvas.getContext('2d');
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 128;
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            visualizerAnalyser = analyser;

            const draw = () => {
                requestAnimationFrame(draw);
                analyser.getByteFrequencyData(dataArray);
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                const barWidth = (canvas.width / bufferLength) * 2;
                let x = 0;
                for (let i = 0; i < bufferLength; i++) {
                    const barHeight = dataArray[i] / 2.5;
                    ctx.fillStyle = `rgba(0, 242, 255, ${barHeight / 120})`;
                    ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
                    x += barWidth + 1;
                }
            };
            draw();
        }
    }
})();
