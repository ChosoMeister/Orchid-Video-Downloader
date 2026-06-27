import { parseHlsPlaylist } from '../lib/hls/hlsParser';
import { parseDashManifest } from '../lib/dash/dashParser';
import { redactUrlParams, sanitizeFilename } from '../lib/security/security';

interface DetectedMedia {
  id: string;
  url: string;
  tabId: number;
  pageUrl: string;
  pageTitle: string;
  format: 'hls' | 'dash' | 'direct';
  mimeType: string;
  size: number;
  headers: Record<string, string>;
  timestamp: number;
}

const noStreamsView = document.getElementById('no-streams-view') as HTMLDivElement;
const streamListContainer = document.getElementById('stream-list-container') as HTMLDivElement;
const clearAllBtn = document.getElementById('clear-all-btn') as HTMLButtonElement;

let currentTabId: number | null = null;
let detectedStreams: DetectedMedia[] = [];

// Entry point
document.addEventListener('DOMContentLoaded', async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0] && tabs[0].id) {
    currentTabId = tabs[0].id;
    await loadStreams();
  }
  
  clearAllBtn.addEventListener('click', handleClearAll);
});

/**
 * Load streams from chrome.storage.session.
 */
async function loadStreams() {
  if (currentTabId === null) return;
  
  const key = `tab_${currentTabId}`;
  const result = await chrome.storage.session.get(key);
  detectedStreams = result[key] || [];

  if (detectedStreams.length === 0) {
    noStreamsView.style.display = 'flex';
    streamListContainer.style.display = 'none';
    clearAllBtn.style.display = 'none';
  } else {
    noStreamsView.style.display = 'none';
    streamListContainer.style.display = 'flex';
    clearAllBtn.style.display = 'block';
    
    streamListContainer.innerHTML = '';
    for (const stream of detectedStreams) {
      const card = await createStreamCard(stream);
      streamListContainer.appendChild(card);
    }
  }
}

/**
 * Creates a stream card with format badge, qualities list or DRM warning.
 */
async function createStreamCard(stream: DetectedMedia): Promise<HTMLDivElement> {
  const card = document.createElement('div');
  card.className = 'stream-card';

  const cleanTitle = sanitizeFilename(stream.pageTitle || 'Video Stream');
  const redactedUrl = redactUrlParams(stream.url);

  // Default header layout
  card.innerHTML = `
    <div class="stream-header">
      <div class="stream-meta">
        <span class="badge badge-${stream.format}">${stream.format}</span>
        <span class="stream-title" title="${cleanTitle}">${cleanTitle}</span>
      </div>
      <button class="btn-delete" title="Remove stream">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
    <div class="url-display" title="${stream.url}">${redactedUrl}</div>
    <div class="variants-section">
      <div class="variants-title">Available Options</div>
      <div class="variants-list" id="variants-list-${stream.id}">
        <div style="font-size: 11px; color: var(--text-secondary);">Loading variants...</div>
      </div>
    </div>
  `;

  // Hook delete button
  const deleteBtn = card.querySelector('.btn-delete') as HTMLButtonElement;
  deleteBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await deleteStream(stream.id);
  });

  // Load and parse manifest asynchronous
  const variantsList = card.querySelector(`#variants-list-${stream.id}`) as HTMLDivElement;
  try {
    if (stream.format === 'hls') {
      const playlistText = await fetchManifestText(stream.url, stream.headers);
      const parsed = parseHlsPlaylist(playlistText, stream.url);

      if (parsed.isEncrypted) {
        variantsList.innerHTML = `
          <div class="unsupported-msg">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            Encrypted stream (DRM) is not supported.
          </div>
        `;
        const badge = card.querySelector(`.badge-${stream.format}`) as HTMLSpanElement;
        badge.className = 'badge badge-unsupported';
        badge.innerText = 'DRM';
      } else if (parsed.isLive) {
        variantsList.innerHTML = `
          <div class="unsupported-msg" style="color: var(--warning);">
            Live stream downloading is not supported in v1.
          </div>
        `;
      } else if (parsed.isMaster) {
        variantsList.innerHTML = '';
        parsed.variants.forEach((v) => {
          const res = v.resolution || 'Auto';
          const fps = v.frameRate ? `${v.frameRate}fps` : '';
          const bandwidth = v.bandwidth ? `${Math.round(v.bandwidth / 1000)} kbps` : '';
          
          const vItem = document.createElement('div');
          vItem.className = 'variant-item';
          vItem.innerHTML = `
            <div class="variant-info">
              <span class="variant-resolution">${res}</span>
              ${fps ? `<span class="variant-fps">${fps}</span>` : ''}
              <div class="variant-bandwidth">${bandwidth} - ${v.codecs || 'unknown codec'}</div>
            </div>
            <button class="btn-download">Download</button>
          `;

          const dlBtn = vItem.querySelector('.btn-download') as HTMLButtonElement;
          dlBtn.addEventListener('click', () => triggerDownload(stream, v.url, res));

          variantsList.appendChild(vItem);
        });
      } else {
        // Media playlist direct
        variantsList.innerHTML = '';
        const vItem = document.createElement('div');
        vItem.className = 'variant-item';
        vItem.innerHTML = `
          <div class="variant-info">
            <span class="variant-resolution">Default Quality</span>
            <div class="variant-bandwidth">${parsed.segments.length} segments detected</div>
          </div>
          <button class="btn-download">Download</button>
        `;
        const dlBtn = vItem.querySelector('.btn-download') as HTMLButtonElement;
        dlBtn.addEventListener('click', () => triggerDownload(stream, stream.url, 'Default'));
        variantsList.appendChild(vItem);
      }
    } else if (stream.format === 'dash') {
      const manifestText = await fetchManifestText(stream.url, stream.headers);
      const parsed = parseDashManifest(manifestText, stream.url);

      if (parsed.isEncrypted) {
        variantsList.innerHTML = `
          <div class="unsupported-msg">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            Encrypted DASH (DRM) is not supported.
          </div>
        `;
        const badge = card.querySelector(`.badge-${stream.format}`) as HTMLSpanElement;
        badge.className = 'badge badge-unsupported';
        badge.innerText = 'DRM';
      } else {
        variantsList.innerHTML = '';
        parsed.representations.forEach((r) => {
          const res = r.width && r.height ? `${r.width}x${r.height}` : r.id;
          const bandwidth = r.bandwidth ? `${Math.round(r.bandwidth / 1000)} kbps` : '';
          
          const vItem = document.createElement('div');
          vItem.className = 'variant-item';
          vItem.innerHTML = `
            <div class="variant-info">
              <span class="variant-resolution">${res} (DASH)</span>
              <div class="variant-bandwidth">${bandwidth} - ${r.mimeType || 'unknown'}</div>
            </div>
            <button class="btn-download">Download</button>
          `;

          const dlBtn = vItem.querySelector('.btn-download') as HTMLButtonElement;
          dlBtn.addEventListener('click', () => triggerDownload(stream, r.url, res));

          variantsList.appendChild(vItem);
        });
      }
    } else {
      // Direct file format (.mp4 etc)
      variantsList.innerHTML = '';
      const sizeStr = stream.size ? `${(stream.size / (1024 * 1024)).toFixed(2)} MB` : 'Unknown Size';
      
      const vItem = document.createElement('div');
      vItem.className = 'variant-item';
      vItem.innerHTML = `
        <div class="variant-info">
          <span class="variant-resolution">Source File</span>
          <div class="variant-bandwidth">${sizeStr} - ${stream.mimeType || 'direct stream'}</div>
        </div>
        <button class="btn-download">Download</button>
      `;

      const dlBtn = vItem.querySelector('.btn-download') as HTMLButtonElement;
      dlBtn.addEventListener('click', () => triggerDownload(stream, stream.url, 'Source'));
      
      variantsList.appendChild(vItem);
    }
  } catch (err) {
    variantsList.innerHTML = `<div style="font-size: 11px; color: var(--error);">Error loading qualities details.</div>`;
  }

  return card;
}

/**
 * Fetch manifest content safely using tab request headers
 */
async function fetchManifestText(url: string, headers: Record<string, string>): Promise<string> {
  const cleanHeaders: Record<string, string> = {};
  
  // Only copy specific non-restricted headers for manifest load
  if (headers['User-Agent']) cleanHeaders['User-Agent'] = headers['User-Agent'];
  if (headers['Referer']) cleanHeaders['Referer'] = headers['Referer'];
  if (headers['Origin']) cleanHeaders['Origin'] = headers['Origin'];

  const res = await fetch(url, {
    method: 'GET',
    headers: cleanHeaders
  });

  if (!res.ok) throw new Error('Network error');
  return await res.text();
}

/**
 * Launches the downloader by saving details in storage and opening downloader page.
 */
async function triggerDownload(stream: DetectedMedia, targetUrl: string, resolution: string) {
  const downloadTaskId = `task_${Date.now()}`;
  
  // Save full task configuration to local storage
  await chrome.storage.local.set({
    [downloadTaskId]: {
      id: downloadTaskId,
      manifestUrl: targetUrl,
      originalUrl: stream.url,
      pageUrl: stream.pageUrl,
      pageTitle: stream.pageTitle,
      format: stream.format,
      resolution,
      headers: stream.headers
    }
  });

  // Open downloader page
  const downloaderPageUrl = chrome.runtime.getURL(`extension/src/downloader/index.html?taskId=${downloadTaskId}`);
  chrome.tabs.create({ url: downloaderPageUrl });
}

/**
 * Deletes a single stream item from popup UI and storage.
 */
async function deleteStream(id: string) {
  if (currentTabId === null) return;
  
  const key = `tab_${currentTabId}`;
  detectedStreams = detectedStreams.filter(item => item.id !== id);
  
  await chrome.storage.session.set({ [key]: detectedStreams });
  await loadStreams();
  
  // Update badge count
  const text = detectedStreams.length > 0 ? detectedStreams.length.toString() : '';
  chrome.action.setBadgeText({ text, tabId: currentTabId });
}

/**
 * Clears all streams for the active tab.
 */
async function handleClearAll() {
  if (currentTabId === null) return;
  
  const key = `tab_${currentTabId}`;
  await chrome.storage.session.remove(key);
  chrome.action.setBadgeText({ text: '', tabId: currentTabId });
  await loadStreams();
}
