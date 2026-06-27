import { validateUrl } from '../lib/security/security';

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

// In-memory cache for request headers because webRequest.onResponseStarted doesn't provide headers
const requestHeadersCache: Record<string, Record<string, string>> = {};

// Initialize storage access level
chrome.runtime.onInstalled.addListener(() => {
  if (chrome.storage.session) {
    chrome.storage.session.setAccessLevel({
      accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS'
    }).catch(err => console.error('Failed to set storage access level:', err));
  }
});

// Listener for tab updates to clean up storage on refresh or close
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    clearTabMedia(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  clearTabMedia(tabId);
});

// Capture request headers
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (!details.url || !details.requestHeaders) return;
    
    // Validate target URL safety
    const check = validateUrl(details.url, true);
    if (!check.isValid) return;

    const headers: Record<string, string> = {};
    for (const h of details.requestHeaders) {
      if (h.name && h.value) {
        const lowerName = h.name.toLowerCase();
        // Capture useful headers for downloads, avoiding auth tokens in logs
        if (['referer', 'user-agent', 'origin'].includes(lowerName)) {
          headers[h.name] = h.value;
        }
      }
    }
    
    requestHeadersCache[details.requestId] = headers;
    
    // Set a timeout to clean up cache if response never starts
    setTimeout(() => {
      delete requestHeadersCache[details.requestId];
    }, 60000);
  },
  { urls: ['http://*/*', 'https://*/*'] },
  ['requestHeaders', 'extraHeaders']
);

// Capture responses and detect media
chrome.webRequest.onResponseStarted.addListener(
  async (details) => {
    const { url, tabId, responseHeaders, statusCode, requestId } = details;
    
    if (tabId === -1 || statusCode < 200 || statusCode >= 300) {
      delete requestHeadersCache[requestId];
      return;
    }

    const check = validateUrl(url, true);
    if (!check.isValid) {
      delete requestHeadersCache[requestId];
      return;
    }

    // Determine content type and content length
    let contentType = '';
    let contentLength = 0;
    
    if (responseHeaders) {
      for (const h of responseHeaders) {
        if (!h.name) continue;
        const name = h.name.toLowerCase();
        if (name === 'content-type' && h.value) {
          contentType = h.value.toLowerCase();
        } else if (name === 'content-length' && h.value) {
          contentLength = parseInt(h.value, 10) || 0;
        }
      }
    }

    const format = detectFormat(url, contentType);
    if (!format) {
      delete requestHeadersCache[requestId];
      return;
    }

    // Skip segments in detection to avoid clutter
    if (isSegmentUrl(url)) {
      delete requestHeadersCache[requestId];
      return;
    }

    // Fetch tab info (URL & Title)
    try {
      const tab = await chrome.tabs.get(tabId);
      const pageUrl = tab.url || '';
      const pageTitle = tab.title || 'Untitled Page';
      
      const headers = requestHeadersCache[requestId] || {};
      delete requestHeadersCache[requestId];

      const mediaItem: DetectedMedia = {
        id: `${tabId}-${btoa(url).substring(0, 16)}`,
        url,
        tabId,
        pageUrl,
        pageTitle,
        format,
        mimeType: contentType,
        size: contentLength,
        headers,
        timestamp: Date.now()
      };

      await saveDetectedMedia(tabId, mediaItem);
    } catch (e) {
      // Tab may have closed
      delete requestHeadersCache[requestId];
    }
  },
  { urls: ['http://*/*', 'https://*/*'] },
  ['responseHeaders']
);

/**
 * Detect media stream format from URL extension or Content-Type header.
 */
function detectFormat(urlStr: string, contentType: string): DetectedMedia['format'] | null {
  const url = new URL(urlStr);
  const path = url.pathname.toLowerCase();

  // HLS Detection
  if (
    path.endsWith('.m3u8') ||
    contentType.includes('application/vnd.apple.mpegurl') ||
    contentType.includes('application/x-mpegurl') ||
    urlStr.includes('playmanifest')
  ) {
    return 'hls';
  }

  // DASH Detection
  if (
    path.endsWith('.mpd') ||
    contentType.includes('application/dash+xml')
  ) {
    return 'dash';
  }

  // Direct media detection (excluding chunk segments)
  if (
    path.endsWith('.mp4') ||
    path.endsWith('.webm') ||
    path.endsWith('.mov') ||
    path.endsWith('.m4v') ||
    contentType.startsWith('video/mp4') ||
    contentType.startsWith('video/webm') ||
    contentType.startsWith('video/quicktime')
  ) {
    return 'direct';
  }

  return null;
}

/**
 * Filter out TS and chunked fragments to avoid flooding the list.
 */
function isSegmentUrl(urlStr: string): boolean {
  const url = new URL(urlStr);
  const path = url.pathname.toLowerCase();
  
  // Common segment extension types
  if (path.endsWith('.ts') || path.endsWith('.m4s') || path.endsWith('.aac')) {
    return true;
  }

  // Segment query patterns (e.g. frag-1, segment_1, chunk_1)
  if (urlStr.includes('/fragments/') || urlStr.includes('/chunks/') || /seg[-_]\d+/i.test(urlStr)) {
    return true;
  }

  return false;
}

/**
 * Save detected media into chrome.storage.session.
 */
async function saveDetectedMedia(tabId: number, media: DetectedMedia): Promise<void> {
  const key = `tab_${tabId}`;
  
  const result = await chrome.storage.session.get(key);
  const list: DetectedMedia[] = result[key] || [];
  
  // Deduplicate by URL
  if (list.some(item => item.url === media.url)) {
    return;
  }
  
  list.push(media);
  await chrome.storage.session.set({ [key]: list });

  // Update badge count
  updateBadge(tabId, list.length);
}

/**
 * Clear detected media for a tab.
 */
async function clearTabMedia(tabId: number): Promise<void> {
  const key = `tab_${tabId}`;
  await chrome.storage.session.remove(key);
  updateBadge(tabId, 0);
}

/**
 * Update Chrome Extension badge count.
 */
function updateBadge(tabId: number, count: number): void {
  const text = count > 0 ? count.toString() : '';
  chrome.action.setBadgeText({ text, tabId });
  chrome.action.setBadgeBackgroundColor({ color: '#8A2BE2', tabId }); // Beautiful violet orchid theme color
}
