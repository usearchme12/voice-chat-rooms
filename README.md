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
