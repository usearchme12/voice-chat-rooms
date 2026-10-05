=== World of Chat: Voice Rooms ===
Contributors: worldofchat
Tags: voice chat, push to talk, audio chat, webrtc, walkie talkie
Requires at least: 5.8
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 1.4.8
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Low-latency, push-to-talk anonymous voice chat rooms with dynamic mic warmup, waveform audio bubbles, and multi-theme support.

== Description ==

World of Chat - Voice Rooms brings low-latency, friction-free push-to-talk voice chat directly into your WordPress site.

Features:
* **One-Click Installation**: Upload and activate via WordPress Admin.
* **Simple Shortcode**: Drop `[woc_voice_room]` onto any page, post, or block.
* **WordPress Member Integration**: Automatically identifies logged-in members with their display name, while allowing guests to pick custom callsigns.
* **Dynamic Mic Warmup (Walkie-Talkie Mode)**: Keeps the mic closed until needed and waits for hardware line stabilization to eliminate dead clicks.
* **Playback Silence Trimming**: Detects leading silence in under 10ms and plays voice audio immediately.
* **Render Sleep Detection**: Automatically displays a stylish standby indicator while free cloud servers spin up from idle.
* **Visual Countdown Ring**: Real-time circular progress animation with automatic transmission cutoff.
* **3 Stunning Built-in Themes**: Cyber-Noir Neon, Clean Slate Dark, and Clean Modern Light.
* **Tactical Radio Chirps**: Authentic synthesizer start/stop transceiver sound effects.
* **Custom Server URL Support**: Connects to the free public cloud signaling server out of the box, or your own self-hosted Node.js / Socket.io server.

== Installation ==

1. Upload the `woc-voice-rooms.zip` file via **Plugins > Add New > Upload Plugin** in your WordPress dashboard.
2. Activate the plugin through the **Plugins** menu.
3. Go to **Settings > Voice Rooms** to configure your server URL, theme, and options.
4. Add `[woc_voice_room]` to any page or post.

== Frequently Asked Questions ==

= Do I need my own voice server to run this plugin? =
No. The plugin comes pre-configured with a free public cloud signaling server so you can test and use it immediately. For high-volume production websites, you can also host your own Node.js / Socket.io server and enter the URL in Settings > Voice Rooms.

= Can visitors use this anonymously? =
Yes. Visitors are not required to register or enter an email. They simply pick a callsign (or receive an automatic guest ID) and tap the microphone to talk.

= Does this work on mobile devices? =
Yes. The plugin is fully responsive and supports both iOS Safari and Android Chrome touch events with AudioContext unlock gestures.

== Shortcode Usage ==

Default:
`[woc_voice_room]`

Clean Dark Theme:
`[woc_voice_room theme="clean-dark"]`

Clean Light Theme:
`[woc_voice_room theme="clean-light"]`

Custom Height and 45-Second Timer:
`[woc_voice_room height="800px" max_seconds="45"]`

== Changelog ==

= 1.4.8 =
* Fixed audioBlob initialization during recording completion to ensure stable message transmission.
* Added automatic callsign re-registration on socket reconnect.
* Enhanced date/time formatting with relative "Today", "Yesterday", and full date displays.
* Added automatic disk modification time fallback for historical voice notes.
* Extended voice note retention to 7 days with strict 25-message storage cap.
* Added safe error handling for pruned audio file redirects.

= 1.4.0 =
* Added dynamic microphone hardware warmup to eliminate initial transmission silence.
* Added instant silence trimming during audio playback.
* Updated live online user count indicator.

= 1.0.0 =
* Initial release of World of Chat Voice Rooms.
