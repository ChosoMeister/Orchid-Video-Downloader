import { describe, it, expect } from 'vitest';
import { validateUrl, redactUrlParams, sanitizeFilename } from '../extension/src/lib/security/security';
import { parseHlsPlaylist, resolveUrl } from '../extension/src/lib/hls/hlsParser';
import { parseDashManifest } from '../extension/src/lib/dash/dashParser';

describe('Security Utilities', () => {
  it('should validate URL protocols and restrict private ranges', () => {
    expect(validateUrl('https://example.com/video.mp4').isValid).toBe(true);
    expect(validateUrl('http://1.1.1.1/stream.m3u8').isValid).toBe(true);
    expect(validateUrl('ftp://example.com/video.mp4').isValid).toBe(false);
    expect(validateUrl('chrome-extension://abcdef/popup.html').isValid).toBe(false);
    expect(validateUrl('http://localhost:3000/').isValid).toBe(false);
    expect(validateUrl('http://127.0.0.1/').isValid).toBe(false);
    expect(validateUrl('http://192.168.1.5/video.m3u8').isValid).toBe(false);
  });

  it('should redact sensitive query parameters', () => {
    const rawUrl = 'https://example.com/media.m3u8?token=secret123&sig=abc&expires=9999&val=ok';
    const redacted = redactUrlParams(rawUrl);
    expect(redacted).toContain('token=%5BREDACTED%5D');
    expect(redacted).toContain('sig=%5BREDACTED%5D');
    expect(redacted).toContain('expires=%5BREDACTED%5D');
    expect(redacted).toContain('val=ok');
  });

  it('should clean and sanitize filenames', () => {
    expect(sanitizeFilename('my/cool\\video?.mp4')).toBe('my_cool_video_.mp4');
    expect(sanitizeFilename('...test...')).toBe('test...');
    expect(sanitizeFilename('')).toBe('download');
  });
});

describe('HLS Parser', () => {
  it('should resolve relative URLs correctly', () => {
    const base = 'https://example.com/streams/master.m3u8';
    expect(resolveUrl(base, 'variant.m3u8')).toBe('https://example.com/streams/variant.m3u8');
    expect(resolveUrl(base, '/root.m3u8')).toBe('https://example.com/root.m3u8');
    expect(resolveUrl(base, 'https://other.com/file.m3u8')).toBe('https://other.com/file.m3u8');
  });

  it('should parse master playlist streams and sort variants', () => {
    const manifest = `
#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360,CODECS="avc1.42e00a"
low.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720,CODECS="avc1.42e00a"
mid.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,CODECS="avc1.42e00a"
high.m3u8
    `;
    const base = 'https://example.com/streams/master.m3u8';
    const info = parseHlsPlaylist(manifest, base);

    expect(info.isMaster).toBe(true);
    expect(info.isLive).toBe(false);
    expect(info.variants.length).toBe(3);
    // Should be sorted by bandwidth descending
    expect(info.variants[0].resolution).toBe('1920x1080');
    expect(info.variants[0].url).toBe('https://example.com/streams/high.m3u8');
    expect(info.variants[2].resolution).toBe('640x360');
  });

  it('should parse media playlist segments and detect DRM/encryption', () => {
    const manifest = `
#EXTM3U
#EXT-X-TARGETDURATION:10
#EXT-X-KEY:METHOD=AES-128,URI="https://example.com/key.bin"
#EXTINF:9.009,
segment1.ts
#EXTINF:9.009,
segment2.ts
#EXT-X-ENDLIST
    `;
    const base = 'https://example.com/streams/media.m3u8';
    const info = parseHlsPlaylist(manifest, base);

    expect(info.isMaster).toBe(false);
    expect(info.isLive).toBe(false);
    expect(info.isEncrypted).toBe(true);
    expect(info.encryptionMethod).toBe('AES-128');
    expect(info.segments.length).toBe(2);
    expect(info.segments[0]).toBe('https://example.com/streams/segment1.ts');
  });

  it('should detect live streams', () => {
    const manifest = `
#EXTM3U
#EXT-X-TARGETDURATION:10
#EXTINF:9.009,
seg1.ts
#EXTINF:9.009,
seg2.ts
    `;
    const base = 'https://example.com/streams/live.m3u8';
    const info = parseHlsPlaylist(manifest, base);
    expect(info.isLive).toBe(true); // No ENDLIST tag
  });
});

describe('DASH Parser', () => {
  it('should parse MPD representations and detect DRM ContentProtection', () => {
    const mpd = `
      <MPD xmlns="urn:mpeg:dash:schema:mpd:2011" mediaPresentationDuration="PT0H1M0.00S">
        <Period>
          <AdaptationSet mimeType="video/mp4">
            <ContentProtection schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed"/>
            <Representation id="v1" bandwidth="1500000" width="1280" height="720">
              <BaseURL>video_720.mp4</BaseURL>
            </Representation>
            <Representation id="v2" bandwidth="800000" width="640" height="360">
              <BaseURL>video_360.mp4</BaseURL>
            </Representation>
          </AdaptationSet>
        </Period>
      </MPD>
    `;
    const base = 'https://example.com/dash/manifest.mpd';
    const info = parseDashManifest(mpd, base);

    expect(info.isEncrypted).toBe(true);
    expect(info.representations.length).toBe(2);
    expect(info.representations[0].width).toBe(1280);
    expect(info.representations[0].url).toBe('https://example.com/dash/video_720.mp4');
  });
});
