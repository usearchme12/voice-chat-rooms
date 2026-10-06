# World of Chat Voice Rooms — Critical Bug & Post-Mortem Log

This document records the major architectural, frontend, and backend bugs diagnosed and resolved in the World of Chat Voice Room ecosystem (Node.js VPS + WordPress Plugin). Refer to this log to prevent regressions during future development.

---

### Bug 1: All Voice Tiles Showing Current Viewer Time (e.g. `16:49`)
- **Severity**: High (UI / Data Integrity)
- **Component**: `voice-room.js` (`createVoiceBubble`) & `class-woc-history.php`
- **Symptoms**: Every voice bubble in the chat stream displayed the exact time the viewer opened or refreshed the page (e.g., all 10 messages showed `16:49`), regardless of when they were actually recorded (even 2 days prior).
- **Root Cause**:
  `createVoiceBubble` was hardcoded to call `new Date().toLocaleTimeString()` dynamically whenever rendering a message bubble into the DOM.
- **Solution**:
  1. Created `formatMessageDate(data)` in `voice-room.js` to parse `data.timestamp` (handling both Unix seconds from PHP and milliseconds from JS) or extract the timestamp from `data.msgId` (`msg-{timestamp}`).
  2. Implemented intelligent relative formatting:
     - Today: `Today, HH:MM`
     - Yesterday: `Yesterday, HH:MM`
     - Older: `D Mon, HH:MM` (e.g. `2 Oct, 18:30`)
  3. Added backend fallback in `class-woc-history.php` (`get_recent_notes`): if an existing audio note in the database lacked a timestamp, the server checks the audio file's actual creation/modification timestamp on disk using `filemtime($file)` and backfills it.

---

### Bug 2: Missing `audioBlob` in `mediaRecorder.onstop` (Recorded Messages Failed to Broadcast)
- **Severity**: Critical (Audio Pipeline / Transmission)
- **Component**: `voice-room.js` (`mediaRecorder.onstop`)
- **Symptoms**: After recording a transmission, the bubble did not appear and the audio chunk was not sent to the room or saved to the server. Worked in older cached sessions but failed immediately on fresh script loads.
- **Root Cause**:
  During a code update, the variable declaration `const audioBlob = new Blob(audioChunks, { type: mimeType });` was omitted immediately before `messageStore.set(msgId, { blob: audioBlob, ... })`. Stopping a recording triggered an uncaught `ReferenceError: audioBlob is not defined`, terminating the execution stack before `socket.emit('audio-chunk')` or `fetch()` could be called.
- **Solution**:
  1. Restored `const audioBlob = new Blob(audioChunks, { type: mimeType });` at the top of `mediaRecorder.onstop`.
  2. Validated with `node -c` syntax check to ensure clean execution.

---

### Bug 3: Render Server Spin-Down & 30–60s Cold Start Delays
- **Severity**: High (Infrastructure / Latency)
- **Component**: Cloud Signaling Server (`onrender.com`)
- **Symptoms**: Visitors landing on `/voice-chat-room/` saw a permanent spinning or yellow "WAKING UP SERVER (~20s)..." banner, frequent connection timeouts, and dropped initial WebSocket connections.
- **Root Cause**:
  Render's free/hobby tier instances enter sleep mode after 15 minutes without active incoming HTTP requests. Waking the container requires a full spin-up cycle taking 30–60 seconds.
- **Solution**:
  1. Migrated the Node.js / Socket.io server to a dedicated Linux VPS at `https://voice.worldofchat.co.uk` (IP: `212.227.57.3`).
  2. Configured persistent PM2 process monitoring and direct TLS.
  3. Updated all default plugin endpoints and fallback references to `https://voice.worldofchat.co.uk`.

---

### Bug 4: Aggressive 24-Hour Purge Leaving Rooms Blank
- **Severity**: Medium (Retention / Community Experience)
- **Component**: `class-woc-history.php` (`woc_save_voice_note`)
- **Symptoms**: After an overnight period with no new voice activity, the entire room history disappeared and newly arriving users saw an empty room with no audio messages to play.
- **Root Cause**:
  A hardcoded 24-hour timestamp cutoff (`time() - 86400`) purged all files older than 24 hours regardless of message count.
- **Solution**:
  1. Extended the retention window from 24 hours to 7 days (`7 * 86400`).
  2. Maintained the strict 25-message hard cap (`MAX_HISTORY = 25`), which guarantees disk usage never exceeds ~2.5 MB while keeping recent conversations intact.

---

### Bug 5: Callsign Loss on Socket Reconnection
- **Severity**: Low (Identity / UX)
- **Component**: `voice-room.js` (`socket.on('connect')`) & `server.js`
- **Symptoms**: If a user's network connection briefly dropped or reconnected, subsequent messages broadcasted as `ANONYMOUS` rather than their chosen callsign or logged-in WordPress name.
- **Root Cause**:
  The server deletes the user mapping on socket disconnect (`users.delete(socket.id)`). When the socket reconnected with a new ID, the client did not re-register its callsign until the user manually interacted with the room.
- **Solution**:
  Added automatic callsign re-registration inside `socket.on('connect')`:
  ```javascript
  const activeCallsign = (callsignInput ? callsignInput.value.trim().toUpperCase() : '') || safeStorage.get('woc_vr_callsign');
  if (activeCallsign) {
      try { socket.emit('register-callsign', activeCallsign); } catch(e) {}
  }
  ```

---

### Bug 6: HTML 404 / 301 Redirect Handled as Audio Data
- **Severity**: Medium (Audio Decoding / Stability)
- **Component**: `voice-room.js` (`attachWaveform`, `playMessage`)
- **Symptoms**: If a client attempted to load an audio URL for a file that had been purged from disk, WordPress returned a 301 redirect to the homepage (`text/html`), causing `audioContext.decodeAudioData()` to throw an `EncodingError: The string did not match the expected pattern`.
- **Root Cause**:
  Fetch requests in `attachWaveform` only checked HTTP status and not `Content-Type`.
- **Solution**:
  Added verification for `!contentType.includes('text/html')` before passing array buffers to `decodeAudioData`. Stale bubbles are safely removed from the UI without throwing unhandled exceptions.

---

### Bug 7: WordPress.org Plugin Directory Review & Compliance Hardening
- **Severity**: High (Compliance / Security / Directory Acceptance)
- **Component**: WordPress Plugin (`world-of-chat-voice-chat`, `woc-voice-chat`, `woc-voice-rooms`)
- **Symptoms**: Submission `SUBMIT-TO-WORDPRESS-ORG.zip` was pended by the WordPress Plugins Team during automated pre-review (`AUTOPREREVIEW TRM-OWN world-of-chat-voice-chat/usearchme00/6Oct26/T1`).
- **Root Causes**:
  1. **Unprefixed Shortcode**: `add_shortcode('voice_room', ...)` collided with WordPress directory prefixing rules.
  2. **Contributor Warning**: Submitting account `usearchme00` was missing from `Contributors:` header in `README.txt`.
  3. **Undocumented External Services**: Render hosting (`voice-chat-rooms-fwf0.onrender.com`) was not disclosed in `README.txt` with Terms and Privacy Policy links.
  4. **External CDN Enqueuing**: `socket.io.min.js` was enqueued from `https://cdn.socket.io`, violating Guideline 7 (no remote executable scripts).
  5. **Remote Google Fonts**: Calling `fonts.googleapis.com` triggered GDPR and Plugin Check warnings.
  6. **Security Vulnerability**: `wp_ajax_nopriv_woc_delete_voice_note` allowed unauthenticated visitors to delete voice notes without capability checks.
  7. **Inline JavaScript Handlers**: Buttons contained raw `onclick` and `ontouchend` attributes in PHP markup.
- **Solution**:
  1. Removed generic `voice_room` shortcode, maintaining only prefixed `[woc_voice_room]`.
  2. Added `usearchme00` to `Contributors:` in `README.txt` and updated `Tested up to: 6.7`.
  3. Added full `== External Services ==` section in `README.txt` disclosing Render (`https://voice-chat-rooms-fwf0.onrender.com`), transmission details, and links to `https://render.com/terms` and `https://render.com/privacy`.
  4. Bundled `socket.io.min.js` (v4.7.2) locally in `assets/js/` and enqueued via `woc-vr-socket-io`.
  5. Bundled self-hosted `orbitron-latin.woff2` and `inter-latin.woff2` locally in `assets/fonts/` with `@font-face` rules and graceful system fallbacks, eliminating all external Google Fonts API calls.
  6. Restricted `ajax_delete_note` exclusively to logged-in administrators (`current_user_can('manage_options')`) and removed the `nopriv` hook. Enforced strict nonce validation in `ajax_get_notes`.
  7. Removed inline JavaScript event handlers from button HTML.
  8. Rebuilt compliant submission package `SUBMIT-TO-WORDPRESS-ORG.zip`.

