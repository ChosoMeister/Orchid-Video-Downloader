# Security Policy

Orchid Video Downloader is built with a strong focus on security, compliance, and user privacy. This document outlines the security controls, legal boundaries, and auditing practices followed in this codebase.

## Legal & Compliance Boundaries

- **DRM Compliance**: This extension does not circumvent, bypass, or mock DRM systems (Widevine, PlayReady, FairPlay, EME). Any stream requiring authentication keys or license servers that indicate DRM/encryption is flagged as **Unsupported**.
- **No Telemetry / No Remote Logging**: The extension performs all detection and download processing locally on the user's browser. It does not exfiltrate headers, URLs, cookies, manifest data, or media chunks to third-party endpoints or telemetry servers.
- **Packaged Downloader Page**: The downloader page runs internal to the extension (`chrome-extension://.../downloader.html`). No remote websites are used for rendering download queues.

## Threat Analysis & Mitigations

### 1. SSRF (Server-Side Request Forgery) in Downloader
Because the extension can fetch URLs, there is a risk of a malicious webpage tricking the extension into scanning or accessing local infrastructure (e.g. `http://localhost:8080/admin`).
* **Mitigation**: The extension validates all detected URLs using `validateUrl()`. It blocks:
  - Private IP networks (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`).
  - Local loopbacks (`localhost`, `127.0.0.1`, `::1`).
  - Standard browser schemas (`chrome://`, `chrome-extension://`, `file://`).

### 2. Sensitive Header and URL Redaction
Many media playlists use signed URLs that contain authentication parameters.
* **Mitigation**: 
  - The utility `redactUrlParams()` replaces known query parameter names like `token`, `sig`, `signature`, `auth`, `jwt`, `session`, `expires` with `[REDACTED]` in all logs, UI displays, and debug outputs.
  - The background script captures only standard headers needed for content retrieval (`Referer`, `Origin`, `User-Agent`) and ignores authorization tokens, session cookies, and cookies.

### 3. Execution Environment Security
* **No Remote Code**: The extension contains no remote script links or scripts loaded dynamically. All libraries (HLS, DASH parsers) are packaged locally.
* **Content Security Policy (CSP)**: The extension uses the default Manifest V3 strict CSP. It does not use `unsafe-eval` or inline script hashes, preventing Cross-Site Scripting (XSS).
