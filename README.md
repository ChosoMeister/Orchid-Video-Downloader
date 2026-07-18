<div align="center">
  <img src="extension/public/icons/orchid.png" width="132" alt="Orchid Video Downloader logo">

  # Orchid Video Downloader

  **Turn the video playing in your browser into a file you can keep — with quality control, visible progress, and no cloud middleman.**

  [English](README.md) · [فارسی](README-fa.md)

  [Download the latest release](https://github.com/ChosoMeister/Orchid-Video-Downloader/releases/latest) · [View security design](SECURITY.md) · [Build from source](#build-from-source)
</div>

---

## Your browser plays it. Orchid finds the stream.

Modern video is rarely delivered as one simple file. It arrives through HLS playlists, DASH manifests, segmented tracks, signed URLs, and multiple quality variants. Orchid turns that complexity into a focused download experience inside Chrome.

Start playback, open the extension, choose the stream or quality you want, and let Orchid handle the rest. No URL hunting. No developer-tools archaeology. No uploading your media activity to a remote conversion service.

> Orchid is designed for public, unencrypted media and content you are authorized to download. It does not bypass DRM, paywalls, authentication, or access controls.

## See it in action

<div align="center">
  <img src="docs/images/demo-popup.png" width="31%" alt="Orchid stream detection popup">
  <img src="docs/images/demo-downloading.png" width="31%" alt="Orchid concurrent download progress">
  <img src="docs/images/demo-finished.png" width="31%" alt="Orchid completed download">
</div>

## Why Orchid feels different

### Detect streams automatically

Orchid watches the active tab's media requests and recognizes HLS (`.m3u8`), DASH (`.mpd`), progressive MP4/WebM/MOV, and supported Vimeo playlist responses. Detection happens without injecting scripts into the page.

### Choose the right quality

Master playlists are parsed into useful options such as resolution, frame rate, bandwidth, and codec information. You choose the variant instead of accepting an arbitrary default.

### Download faster, recover smarter

Segmented media is downloaded concurrently with an adjustable connection limit. Failed requests use exponential-backoff retries, while segments are indexed and reassembled in the correct order.

### Keep the workload on your machine

Orchid has no analytics endpoint, remote converter, or media-processing server. Detection, parsing, temporary segment storage, assembly, and supported audio/video muxing run locally in the browser.

## Built for demanding streams

| Capability | What it gives you |
| --- | --- |
| HLS parsing | Master/media playlist detection, quality variants, VOD segment extraction |
| DASH parsing | Representation discovery with resolution, bandwidth, and MIME metadata |
| Progressive media | Direct handling of MP4, WebM, MOV, and M4V responses |
| Vimeo track support | Separate audio/video track processing with in-browser FFmpeg WebAssembly muxing |
| Concurrent engine | Configurable 1, 2, 3, or 5 parallel requests |
| Local segment cache | IndexedDB-backed chunks to reduce pressure on memory during larger jobs |
| Resilient transfers | Automatic retries with exponential backoff after transient network failures |
| Visual telemetry | Live percentage, segment map, transferred size, speed, and time estimate |
| Pause and resume | Control an active segmented download from the dedicated downloader view |

## Privacy and security are product features

Orchid is built on Chrome Manifest V3 with a deliberately local architecture:

- No telemetry, tracking, remote logging, or third-party conversion API.
- No collection of cookies or authorization headers.
- Only the `Referer`, `Origin`, and `User-Agent` headers needed for compatible media retrieval are retained temporarily.
- Sensitive URL parameters such as tokens, signatures, and session values are redacted in the interface.
- Localhost, loopback, private-network targets, and non-HTTP protocols are rejected.
- Encrypted or DRM-protected streams are detected and marked unsupported.
- All executable code and FFmpeg WebAssembly assets are packaged with the extension.

Read the complete [security and compliance design](SECURITY.md).

## Install Orchid

### Latest packaged release

1. Download `orchid-downloader.zip` from the [latest GitHub release](https://github.com/ChosoMeister/Orchid-Video-Downloader/releases/latest).
2. Extract the ZIP to a permanent folder.
3. Open `chrome://extensions/` in Google Chrome.
4. Enable **Developer mode**.
5. Select **Load unpacked** and choose the extracted folder.
6. Pin Orchid to the toolbar, play an authorized video, and open the extension.

> A Chrome Web Store release is being prepared. Until it is available, GitHub Releases provides the latest packaged build.

## Four steps from playback to file

1. **Play** the video so its media requests become available to the browser.
2. **Open Orchid** and review the detected formats and qualities.
3. **Choose Download** for the variant you want.
4. **Monitor and save** from the dedicated downloader page.

## Build from source

Requirements: Node.js 18 or newer and npm.

```bash
git clone https://github.com/ChosoMeister/Orchid-Video-Downloader.git
cd Orchid-Video-Downloader
npm install
npm test
npm run build
```

Load the generated `dist/` directory from `chrome://extensions/` using **Load unpacked**.

## Engineering overview

```text
extension/src/background/   media request detection and per-tab session state
extension/src/popup/        detected-stream and quality-selection interface
extension/src/downloader/   transfer controls, progress UI, assembly, and saving
extension/src/lib/hls/      HLS playlist parser
extension/src/lib/dash/     DASH manifest parser
extension/src/lib/vimeo/    Vimeo playlist and track parser
extension/src/lib/download/ concurrent download engine and retry strategy
extension/src/lib/storage/  IndexedDB segment persistence
extension/src/lib/security/ URL validation, redaction, and filename sanitization
tests/                      parser, downloader, and security test coverage
```

The production build is compiled with TypeScript and Vite. GitHub Actions runs the build and publishes a ready-to-install ZIP from the `main` branch.

## Current boundaries

- **DRM and encrypted media:** Widevine, PlayReady, FairPlay, EME-protected, and encrypted playlists are intentionally unsupported.
- **Live streaming:** Live HLS/DASH sessions are detected but are not downloadable in the current release.
- **HLS output:** Browser-side HLS assembly currently produces an MPEG-TS (`.ts`) file. It can be remuxed to MP4 with FFmpeg without re-encoding.
- **DASH compatibility:** DASH layouts vary by provider; representation handling is currently experimental for complex manifests.
- **Site compatibility:** A website's delivery method, access policy, CORS configuration, or manifest structure can affect detection and downloading.

## Try it with legal test streams

- [Bitmovin Stream Test](https://bitmovin.com/demos/stream-test)
- [Video.js HLS Demo](https://videojs.github.io/videojs-contrib-hls/)
- [HLS.js Demo](https://video-dev.github.io/hls.js/demo/)

## Responsible use

Use Orchid only for media you own, public-domain material, openly licensed content, or downloads explicitly permitted by the content provider. Orchid does not grant rights to media and is not intended to circumvent technical protections or platform restrictions.

<div align="center">
  <strong>Ready to make browser media easier to manage?</strong><br><br>
  <a href="https://github.com/ChosoMeister/Orchid-Video-Downloader/releases/latest"><strong>Download Orchid Video Downloader →</strong></a>
</div>
