import { parseHlsPlaylist } from '../lib/hls/hlsParser';
import { parseDashManifest } from '../lib/dash/dashParser';
import { getSegment, clearSegments } from '../lib/storage/indexedDBHelper';
import { DownloaderEngine, DownloadProgress } from '../lib/download/downloaderEngine';
import { sanitizeFilename } from '../lib/security/security';

interface DownloadTask {
  id: string;
  manifestUrl: string;
  originalUrl: string;
  pageUrl: string;
  pageTitle: string;
  format: 'hls' | 'dash' | 'direct';
  resolution: string;
  headers: Record<string, string>;
}

// DOM Elements
const filenameInput = document.getElementById('filename-input') as HTMLInputElement;
const formatBadge = document.getElementById('format-badge') as HTMLSpanElement;
const resolutionDetail = document.getElementById('resolution-detail') as HTMLSpanElement;
const sourceUrl = document.getElementById('source-url') as HTMLAnchorElement;
const chunksMetric = document.getElementById('chunks-metric') as HTMLDivElement;
const sizeMetric = document.getElementById('size-metric') as HTMLDivElement;
const speedMetric = document.getElementById('speed-metric') as HTMLDivElement;
const timeMetric = document.getElementById('time-metric') as HTMLDivElement;
const progressFill = document.getElementById('progress-fill') as HTMLDivElement;
const progressPercentage = document.getElementById('progress-percentage') as HTMLDivElement;
const pauseResumeBtn = document.getElementById('pause-resume-btn') as HTMLButtonElement;
const cancelBtn = document.getElementById('cancel-btn') as HTMLButtonElement;
const threadsSelect = document.getElementById('threads-select') as HTMLSelectElement;
const segmentsGrid = document.getElementById('segments-grid') as HTMLDivElement;
const segmentsStatusText = document.getElementById('segments-status-text') as HTMLSpanElement;
const statusBanner = document.getElementById('status-banner') as HTMLDivElement;
const strategyExplanation = document.getElementById('strategy-explanation') as HTMLSpanElement;

let task: DownloadTask | null = null;
let engine: DownloaderEngine | null = null;
let segmentUrls: string[] = [];
let dotElements: HTMLDivElement[] = [];

// Init page
document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const taskId = urlParams.get('taskId');
  
  if (!taskId) {
    showError('No download task specified.');
    return;
  }

  // Get task configuration
  const result = await chrome.storage.local.get(taskId);
  task = result[taskId] as DownloadTask;

  if (!task) {
    showError('Download task not found or expired.');
    return;
  }

  // Remove task from storage to clean up
  await chrome.storage.local.remove(taskId);

  // Setup UI details
  initUI();
  
  // Initialize manifest fetch & parser
  await initializeStream();
});

function initUI() {
  if (!task) return;

  const defaultName = sanitizeFilename(task.pageTitle || 'media_download');
  filenameInput.value = defaultName;
  
  formatBadge.className = `badge badge-${task.format}`;
  formatBadge.innerText = task.format;
  resolutionDetail.innerText = `Quality/Res: ${task.resolution}`;
  sourceUrl.href = task.originalUrl;
  
  // Set output strategy explanation
  if (task.format === 'hls') {
    strategyExplanation.innerHTML = `Segments will be concatenated in order and saved as a <strong>.ts</strong> video file. Can be played using VLC player or remuxed using standard media tools.`;
  } else if (task.format === 'dash') {
    strategyExplanation.innerHTML = `DASH segments will be parsed and downloaded. Dynamic segment templating is experimental.`;
  } else {
    strategyExplanation.innerHTML = `Direct progressive file. Will download directly as a single stream and save with original file extension.`;
  }

  // Event handlers
  pauseResumeBtn.addEventListener('click', handlePauseResume);
  cancelBtn.addEventListener('click', handleCancel);
  threadsSelect.addEventListener('change', handleThreadsChange);
}

function showError(msg: string) {
  statusBanner.className = 'status-banner error';
  statusBanner.innerText = msg;
  statusBanner.style.display = 'block';
}

function showSuccess(msg: string) {
  statusBanner.className = 'status-banner success';
  statusBanner.innerText = msg;
  statusBanner.style.display = 'block';
}

/**
 * Fetch the target playlist/manifest or setup direct file download.
 */
async function initializeStream() {
  if (!task) return;

  segmentsStatusText.innerText = 'Analyzing stream structure...';
  
  try {
    if (task.format === 'hls') {
      const response = await fetch(task.manifestUrl, {
        headers: task.headers
      });
      if (!response.ok) throw new Error(`Failed to load playlist: ${response.statusText}`);
      
      const playlistText = await response.text();
      const parsed = parseHlsPlaylist(playlistText, task.manifestUrl);
      
      if (parsed.isLive) {
        showError('Live HLS streams are not supported in this version.');
        return;
      }
      
      segmentUrls = parsed.segments;
    } else if (task.format === 'dash') {
      const response = await fetch(task.manifestUrl, {
        headers: task.headers
      });
      if (!response.ok) throw new Error(`Failed to load DASH manifest: ${response.statusText}`);
      
      const manifestText = await response.text();
      const parsed = parseDashManifest(manifestText, task.manifestUrl);
      
      // Simple DASH representation download
      const targetRep = parsed.representations.find(r => `${r.width}x${r.height}` === task?.resolution || r.id === task?.resolution);
      const targetUrl = targetRep ? targetRep.url : task.manifestUrl;
      segmentUrls = [targetUrl]; // Fallback to representations URL
    } else {
      // Direct stream
      segmentUrls = [task.manifestUrl];
    }

    if (segmentUrls.length === 0) {
      showError('No media segments detected in manifest.');
      return;
    }

    // Build visual map
    buildSegmentMap();

    // Start downloader engine
    const concurrency = parseInt(threadsSelect.value, 10) || 3;
    engine = new DownloaderEngine(task.id, segmentUrls, task.headers, concurrency, handleProgress);
    
    // Auto-start download
    engine.start();
  } catch (err: any) {
    showError(`Stream Initialization Error: ${err.message}`);
  }
}

/**
 * Create visual block indicator map for downloading segments.
 */
function buildSegmentMap() {
  segmentsGrid.innerHTML = '';
  dotElements = [];
  
  const total = segmentUrls.length;
  // Cap visual block indicator representation to avoid browser freeze
  const maxVisualDots = Math.min(total, 600);
  
  for (let i = 0; i < maxVisualDots; i++) {
    const dot = document.createElement('div');
    dot.className = 'segment-dot';
    dot.title = `Segment ${i + 1}`;
    segmentsGrid.appendChild(dot);
    dotElements.push(dot);
  }

  segmentsStatusText.innerText = `0 of ${total} segments completed`;
}

/**
 * Handle progress updates from DownloaderEngine.
 */
async function handleProgress(p: DownloadProgress) {
  if (!task) return;

  // Chunks and Percentage metrics
  chunksMetric.innerText = `${p.downloadedSegments} / ${p.totalSegments}`;
  progressFill.style.width = `${p.percentage}%`;
  progressPercentage.innerText = `${p.percentage}%`;

  // Size metric
  const mbDownloaded = p.downloadedBytes / (1024 * 1024);
  sizeMetric.innerText = `${mbDownloaded.toFixed(2)} MB`;

  // Speed metric
  if (p.speed > 1024 * 1024) {
    speedMetric.innerText = `${(p.speed / (1024 * 1024)).toFixed(2)} MB/s`;
  } else {
    speedMetric.innerText = `${(p.speed / 1024).toFixed(1)} KB/s`;
  }

  // Time remaining metric
  if (p.status === 'downloading' && p.speed > 0) {
    const bytesRemaining = (p.totalSegments - p.downloadedSegments) * (p.downloadedBytes / Math.max(p.downloadedSegments, 1));
    const secondsLeft = Math.round(bytesRemaining / p.speed);
    
    if (secondsLeft > 3600) {
      const h = Math.floor(secondsLeft / 3600);
      const m = Math.floor((secondsLeft % 3600) / 60);
      timeMetric.innerText = `${h}h ${m}m`;
    } else if (secondsLeft > 60) {
      const m = Math.floor(secondsLeft / 60);
      const s = secondsLeft % 60;
      timeMetric.innerText = `${m}m ${s}s`;
    } else {
      timeMetric.innerText = `${secondsLeft}s`;
    }
  } else {
    timeMetric.innerText = '--:--';
  }

  // Update segments visualization map
  const maxVisualDots = dotElements.length;
  if (maxVisualDots > 0) {
    // Map completed progress proportionately to visual dots
    const ratio = p.downloadedSegments / p.totalSegments;
    const completedDots = Math.floor(ratio * maxVisualDots);
    
    for (let i = 0; i < maxVisualDots; i++) {
      const dot = dotElements[i];
      if (i < completedDots) {
        dot.className = 'segment-dot completed';
      } else if (p.status === 'downloading' && i === completedDots) {
        dot.className = 'segment-dot downloading';
      } else if (p.status === 'failed') {
        dot.className = 'segment-dot failed';
      } else {
        dot.className = 'segment-dot';
      }
    }
  }

  segmentsStatusText.innerText = `${p.downloadedSegments} of ${p.totalSegments} segments completed`;

  // UI state for pause/resume button
  if (p.status === 'downloading') {
    pauseResumeBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="6" y="4" width="4" height="16"></rect>
        <rect x="14" y="4" width="4" height="16"></rect>
      </svg>
      Pause
    `;
    pauseResumeBtn.className = 'btn btn-primary';
  } else if (p.status === 'paused') {
    pauseResumeBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="5 3 19 12 5 21 5 3"></polygon>
      </svg>
      Resume
    `;
    pauseResumeBtn.className = 'btn btn-primary';
  }

  if (p.status === 'failed') {
    showError(p.error || 'Download failed.');
  } else if (p.status === 'completed') {
    showSuccess('Download completed! Assembling file segments...');
    await assembleAndDownload();
  }
}

/**
 * Handle Pause/Resume toggle button.
 */
function handlePauseResume() {
  if (!engine) return;
  
  if (engine.getStatus() === 'downloading') {
    engine.pause();
  } else if (engine.getStatus() === 'paused') {
    engine.resume();
  }
}

/**
 * Cancel download and clean up files cache.
 */
async function handleCancel() {
  if (confirm('Are you sure you want to cancel the download? This clears current progress.') && engine && task) {
    engine.cancel();
    await clearSegments(task.id);
    window.close();
  }
}

/**
 * Change download threads limit dynamically.
 */
function handleThreadsChange() {
  if (engine) {
    const limit = parseInt(threadsSelect.value, 10) || 3;
    engine.setConcurrency(limit);
  }
}

/**
 * Assemble segments from IndexedDB, create Blob, and trigger downloads.
 */
async function assembleAndDownload() {
  if (!task) return;
  
  try {
    const total = segmentUrls.length;
    const chunks: ArrayBuffer[] = [];

    segmentsStatusText.innerText = 'Compiling file buffer from cache...';
    
    // Retrieve segments from IndexedDB sequentially
    for (let i = 0; i < total; i++) {
      const data = await getSegment(task.id, i);
      if (!data) {
        throw new Error(`Failed to load segment index ${i} from IndexedDB cache.`);
      }
      chunks.push(data);
    }

    segmentsStatusText.innerText = 'Creating video object blob...';
    
    // Set appropriate output MIME type and extension
    let mimeType = 'video/mp2t';
    let fileExtension = 'ts';

    if (task.format === 'direct') {
      mimeType = 'video/mp4';
      fileExtension = 'mp4';
      
      // Auto-extract extension from URL if possible
      const path = new URL(task.manifestUrl).pathname.toLowerCase();
      if (path.endsWith('.webm')) {
        mimeType = 'video/webm';
        fileExtension = 'webm';
      } else if (path.endsWith('.mov')) {
        mimeType = 'video/quicktime';
        fileExtension = 'mov';
      }
    }

    const blob = new Blob(chunks, { type: mimeType });
    const objectUrl = URL.createObjectURL(blob);
    const outputFilename = `${sanitizeFilename(filenameInput.value)}.${fileExtension}`;

    segmentsStatusText.innerText = 'Saving file to host download path...';

    // Trigger standard browser download
    chrome.downloads.download({
      url: objectUrl,
      filename: outputFilename,
      saveAs: true
    }, async () => {
      if (chrome.runtime.lastError) {
        showError(`Failed to save file: ${chrome.runtime.lastError.message}`);
      } else {
        showSuccess(`Saved successfully! Filename: ${outputFilename}`);
        segmentsStatusText.innerText = 'Completed. File saved.';
        
        // Clean up temporary segments from IndexedDB
        await clearSegments(task!.id);
      }
    });

  } catch (err: any) {
    showError(`Assembly Failure: ${err.message}`);
  }
}
