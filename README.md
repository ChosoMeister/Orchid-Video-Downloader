# Orchid Video Downloader Extension

Orchid Video Downloader is a clean-room, secure Chrome Manifest V3 extension designed to detect, parse, and download browser-played media streams directly to the local machine. It intercepts HLS (`.m3u8`), DASH (`.mpd`), and progressive formats (`.mp4`, `.webm`) securely, prioritizing user privacy and legal compliance.

## Features

- **Passive Stream Detection**: Intercepts request headers and response streams on allowed pages to detect media URLs without injecting code into pages.
- **VOD Playlist Parsing**: Extracts multiple variant qualities (resolution, bandwidth, codecs) from HLS and DASH master manifests.
- **Threaded Concurrent Downloading**: Downloads HLS segments in parallel using customizable thread concurrency (1, 2, 3, 5).
- **On-disk Segment Caching**: Leverages IndexedDB to cache downloaded segments, preventing high RAM footprint on larger video downloads.
- **Robust Retries**: Features automated exponential backoff retries for segments that encounter network drops.
- **Order Preservation**: Re-assembles downloaded TS segments in the correct index order and triggers a safe file-save via Chrome Downloads.
- **Security-First Architecture**: 
  - Validates URLs (rejects localhost, private IPs, non-http protocols).
  - Redacts sensitive request parameters (JWTs, tokens, auth keys) in all logs.
  - Detects DRM/Encryption configurations and flags them as unsupported.

## Installation in Chrome

1. Clone or copy the extension source code to your machine.
2. Build the project using npm:
   ```bash
   npm install
   npm run build
   ```
3. Open Google Chrome.
4. Navigate to `chrome://extensions/`.
5. Enable **Developer mode** (toggle switch in the top right).
6. Click **Load unpacked** (button in the top left).
7. Select the compiled `dist/` directory in the project folder.

## Project Structure

- `extension/public/` - Static assets including `manifest.json` and logos.
- `extension/src/background/` - Intercepts requests, detects streams, and manages session state.
- `extension/src/popup/` - Populates active tab media items, lists variant qualities.
- `extension/src/downloader/` - Packs downloader page featuring visual segment indicator grids and metrics.
- `extension/src/lib/` - Parsers, download engine, IndexedDB helper, and security validations.
- `tests/` - Unit tests for security, path resolution, and parser libraries.
- `native-helper/` - Draft spec for companion app for ffmpeg-based MP4 remuxing.

## Current Limitations (v1)

1. **DRM / Encrypted Streams**: Bypass of DRM (Widevine, PlayReady, etc.) is strictly unsupported. Encrypted streams will be marked unsupported.
2. **Live Streams**: HLS/DASH live streams are identified but marked unsupported for download in this version.
3. **MPEG-TS Concat**: Browser-only assembly merges MPEG-TS HLS segments into a `.ts` output file. To convert to `.mp4`, a native companion app or local `ffmpeg` execution is recommended.

## Testing with Legitimate Streams

You can test the extension on public, unencrypted HLS test pages:
- [Bitmovin HLS Test Player](https://bitmovin.com/demos/stream-test)
- [VideoJS HLS Demo](https://videojs.github.io/videojs-contrib-hls/)
- [HLS.js Demo](https://video-dev.github.io/hls.js/demo/)

Play any of the VOD sample streams on these sites and click the Orchid logo in your browser toolbar to select and download your preferred resolution.
