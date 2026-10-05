# World of Chat - Anonymous Voice Rooms

This is the official repository for the low-latency, anonymous push-to-talk Voice Rooms running on [World of Chat Voice Rooms](https://www.worldofchat.co.uk/voice-chat-rooms).

---

## What is World of Chat?

[World of Chat](https://www.worldofchat.co.uk/) is a long-standing online community dedicated to bringing people together across the globe for real-time anonymous interaction. 

### Why We Created Voice Rooms
Traditional voice communication platforms like Discord or Zoom are built for coordinated gaming squads or corporate meetings, requiring email verification, heavy application downloads, and complex server management.

We created this **Voice Room** platform to provide a frictionless, zero-bloat alternative for chatroom lovers:
- **No Registration / 100% Anonymous**: No emails, no passwords, no trackable data.
- **Push-to-Talk Transceiver Style**: Prevents background noise, keyboard clicks, and heavy breathing.
- **Embedded Directly**: Runs natively on the browser with instant mobile and desktop access.

---

## Technical Specifications & Features

To solve the limitations of web browser audio capture (specifically hardware startup delays on webcam mics), this app includes custom audio-engineering features:

1. **Dynamic Mic Warmup (Walkie-Talkie Mode)**:
   - The microphone is kept strictly closed when not recording.
   - When the user holds the mic button, the app waits dynamically for the microphone's hardware Analog-to-Digital Converter to stabilize and start transmitting signal before beginning recording, eliminating initial silent files.
2. **Playback Silence Trimming**:
   - Playback decodes the audio and scans the channel data in under **10 milliseconds** to skip leading silent frames (created by user reaction time). Playback starts instantly.
3. **WhatsApp-Style Waveforms**:
   - The UI generates vertical audio waveforms from the recorded peaks in the background, which light up in neon cyan/violet during active playback.
4. **Callsigns & Live Transmission HUD**:
   - Users select a custom handle (like VIPER) on join.
   - When speaking, a room-wide HUD flashes `● VIPER IS TRANSMITTING...` so users know who is speaking live.
5. **Tactical Radio Chirps**:
   - Native Web Audio synthesizer beeps play on start and end of transmission.

---

## Infrastructure: Migration to Dedicated VPS (`voice.worldofchat.co.uk`)

### Why We Moved from Render (`onrender.com`) to the Dedicated VPS
Previously, the Node.js / Socket.io signaling server was hosted on Render (`https://voice-chat-rooms-fwf0.onrender.com`). We permanently migrated production to a dedicated Linux VPS at `https://voice.worldofchat.co.uk` (IP: `212.227.57.3`) for several critical architectural reasons:

1. **Elimination of Cold Starts & Spin-Down Latency**:
   - Render's free/hobby instances automatically spin down to 0 after 15 minutes of inactivity. When a visitor opened the voice room, the server required 30 to 60 seconds to spin up, causing connection timeouts and a broken user experience.
   - The dedicated VPS runs persistently 24/7 with PM2 / Systemd service supervisors, guaranteeing instant (<100ms) WebSocket handshakes at all times.
2. **Dedicated System Memory & Audio Buffering**:
   - Multi-user voice chunks (up to 10MB per stream) require stable memory buffers. The VPS eliminates memory capping and aggressive process kills.
3. **Direct Domain & SSL Integration**:
   - Running directly on `https://voice.worldofchat.co.uk` unifies branding, eliminates third-party host dependency, and resolves strict browser cross-origin audio / CORS policies.

---

## WordPress Integration (`woc-voice-chat` & `woc-voice-rooms`)

The repository includes the production WordPress plugin located in `wordpress-plugin/`:
- **Default Server**: Points to `https://voice.worldofchat.co.uk`.
- **Status Indicator**: Displays real-time online presence as `X ONLINE` (replacing the generic `SIGNAL` label).
- **Persistent Message Storage**:
  - Automatically records up to 25 historical voice messages on disk and in WordPress options (`woc_vr_recent_history`).
  - Audio notes older than 7 days are auto-pruned to protect disk storage while ensuring the room never resets to blank overnight.
- **Accurate Timestamping**:
  - Dynamically displays `Today, HH:MM`, `Yesterday, HH:MM`, or `D Mon, HH:MM`.
  - Automatically falls back to file modification time (`filemtime`) on disk for legacy audio files to avoid inaccurate viewer page-load clocks.
- **Microphone Hardware Stabilization**:
  - Dynamically waits for mic hardware signal detection before recording chunks, preventing clipped or blank audio files.

---

## Installation & Local Run

### Prerequisites
- Node.js installed locally.

### Setup
From the `voice-room` directory:
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the local server:
   ```bash
   node server.js
   ```
3. Open `http://localhost:3000` in your web browser.
