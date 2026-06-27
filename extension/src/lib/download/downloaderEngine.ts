import { saveSegment } from '../storage/indexedDBHelper';

export interface DownloadProgress {
  percentage: number;
  downloadedSegments: number;
  totalSegments: number;
  downloadedBytes: number;
  speed: number; // bytes per second
  status: 'idle' | 'downloading' | 'paused' | 'failed' | 'completed';
  error?: string;
}

export type ProgressCallback = (progress: DownloadProgress) => void;

export class DownloaderEngine {
  private downloadId: string;
  private urls: string[];
  private headers: Record<string, string>;
  private concurrency: number;
  private progressCallback: ProgressCallback;
  
  private activeConnections = 0;
  private currentIndex = 0;
  private completedCount = 0;
  private downloadedBytes = 0;
  private status: DownloadProgress['status'] = 'idle';
  private error?: string;

  private abortController: AbortController | null = null;
  private pausedIndices: Set<number> = new Set();
  private failedIndices: Set<number> = new Set();
  
  // Speed calculation
  private startTime = 0;
  private lastSpeedCheckTime = 0;
  private lastSpeedCheckBytes = 0;
  private currentSpeed = 0;

  constructor(
    downloadId: string,
    urls: string[],
    headers: Record<string, string> = {},
    concurrency = 3,
    onProgress: ProgressCallback
  ) {
    this.downloadId = downloadId;
    this.urls = urls;
    this.headers = headers;
    this.concurrency = concurrency;
    this.progressCallback = onProgress;
  }

  public setConcurrency(concurrency: number) {
    this.concurrency = concurrency;
  }

  public getStatus(): DownloadProgress['status'] {
    return this.status;
  }

  public async start(): Promise<void> {
    if (this.status === 'downloading') return;
    
    this.status = 'downloading';
    this.abortController = new AbortController();
    this.startTime = Date.now();
    this.lastSpeedCheckTime = this.startTime;
    this.lastSpeedCheckBytes = this.downloadedBytes;

    this.triggerProgress();
    this.pump();
  }

  public pause(): void {
    if (this.status !== 'downloading') return;
    this.status = 'paused';
    if (this.abortController) {
      this.abortController.abort();
    }
    this.triggerProgress();
  }

  public resume(): void {
    if (this.status !== 'paused') return;
    this.status = 'downloading';
    this.abortController = new AbortController();
    this.startTime = Date.now();
    this.lastSpeedCheckTime = this.startTime;
    this.lastSpeedCheckBytes = this.downloadedBytes;
    
    // Any incomplete or failed indices should be retried
    this.triggerProgress();
    this.pump();
  }

  public cancel(): void {
    this.status = 'idle';
    if (this.abortController) {
      this.abortController.abort();
    }
    this.currentIndex = 0;
    this.completedCount = 0;
    this.downloadedBytes = 0;
    this.currentSpeed = 0;
    this.pausedIndices.clear();
    this.failedIndices.clear();
    this.triggerProgress();
  }

  private triggerProgress() {
    const total = this.urls.length;
    const percentage = total > 0 ? Math.round((this.completedCount / total) * 100) : 0;
    
    // Update speed calculation
    const now = Date.now();
    const elapsed = now - this.lastSpeedCheckTime;
    if (elapsed >= 1000) {
      const bytesDiff = this.downloadedBytes - this.lastSpeedCheckBytes;
      this.currentSpeed = (bytesDiff / elapsed) * 1000;
      this.lastSpeedCheckTime = now;
      this.lastSpeedCheckBytes = this.downloadedBytes;
    }

    this.progressCallback({
      percentage,
      downloadedSegments: this.completedCount,
      totalSegments: total,
      downloadedBytes: this.downloadedBytes,
      speed: this.status === 'downloading' ? this.currentSpeed : 0,
      status: this.status,
      error: this.error
    });
  }

  private pump() {
    if (this.status !== 'downloading') return;

    // Check if finished
    if (this.completedCount === this.urls.length) {
      this.status = 'completed';
      this.currentSpeed = 0;
      this.triggerProgress();
      return;
    }

    // Spawn new downloads up to concurrency
    while (this.activeConnections < this.concurrency && this.status === 'downloading') {
      let indexToDownload = -1;

      // Prioritize failed segments first
      if (this.failedIndices.size > 0) {
        const firstFailed = this.failedIndices.values().next().value;
        if (firstFailed !== undefined) {
          this.failedIndices.delete(firstFailed);
          indexToDownload = firstFailed;
        }
      } else if (this.currentIndex < this.urls.length) {
        indexToDownload = this.currentIndex;
        this.currentIndex++;
      } else {
        break; // No more segments to download
      }

      if (indexToDownload !== -1) {
        this.activeConnections++;
        this.downloadSegmentWithRetry(indexToDownload);
      }
    }
  }

  private async downloadSegmentWithRetry(index: number, attempt = 1): Promise<void> {
    const maxRetries = 3;
    const backoffMs = Math.pow(2, attempt) * 500; // Exponential backoff: 1s, 2s, 4s...

    try {
      if (this.status !== 'downloading') {
        this.activeConnections--;
        this.failedIndices.add(index); // Pick up when resumed
        return;
      }

      const signal = this.abortController?.signal;
      const url = this.urls[index];
      
      const response = await fetch(url, {
        method: 'GET',
        headers: this.headers,
        signal
      });

      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
      }

      const data = await response.arrayBuffer();
      
      if (this.status !== 'downloading') {
        this.activeConnections--;
        this.failedIndices.add(index);
        return;
      }

      // Save chunk to IndexedDB
      await saveSegment(this.downloadId, index, data);
      
      this.downloadedBytes += data.byteLength;
      this.completedCount++;
      this.activeConnections--;
      
      this.triggerProgress();
      this.pump();
    } catch (e: any) {
      if (e.name === 'AbortError' || this.status !== 'downloading') {
        this.activeConnections--;
        this.failedIndices.add(index);
        return;
      }

      console.warn(`Segment ${index} download failed (attempt ${attempt}):`, e);

      if (attempt < maxRetries) {
        setTimeout(() => {
          this.downloadSegmentWithRetry(index, attempt + 1);
        }, backoffMs);
      } else {
        this.activeConnections--;
        this.failedIndices.add(index);
        
        // If all active downloads fail and we can't advance, set failed state
        if (this.activeConnections === 0 && this.failedIndices.size > 0 && this.currentIndex >= this.urls.length) {
          this.status = 'failed';
          this.error = `Failed to download segment index ${index}. Max retries exceeded.`;
          this.triggerProgress();
        } else {
          // Continue attempting other segments
          this.triggerProgress();
          this.pump();
        }
      }
    }
  }
}
