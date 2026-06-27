import { describe, it, expect } from 'vitest';
import { parseHlsPlaylist, resolveUrl } from './hlsParser';

describe('hlsParser', () => {
  describe('resolveUrl', () => {
    it('should resolve relative urls', () => {
      expect(resolveUrl('https://example.com/playlist.m3u8', 'segment1.ts')).toBe('https://example.com/segment1.ts');
    });

    it('should not modify absolute urls', () => {
      expect(resolveUrl('https://example.com/playlist.m3u8', 'https://other.com/seg.ts')).toBe('https://other.com/seg.ts');
    });
  });

  describe('parseHlsPlaylist', () => {
    it('should parse master playlist', () => {
      const m3u8 = `
#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1280x720
1080p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=640x360
720p.m3u8
      `.trim();
      const result = parseHlsPlaylist(m3u8, 'https://example.com/master.m3u8');
      expect(result.isMaster).toBe(true);
      expect(result.variants.length).toBe(2);
      expect(result.variants[0].resolution).toBe('1280x720');
      expect(result.variants[0].url).toBe('https://example.com/1080p.m3u8');
    });

    it('should parse media playlist', () => {
      const m3u8 = `
#EXTM3U
#EXT-X-TARGETDURATION:10
#EXTINF:9.0,
seg1.ts
#EXTINF:9.0,
seg2.ts
      `.trim();
      const result = parseHlsPlaylist(m3u8, 'https://example.com/media.m3u8');
      expect(result.isMaster).toBe(false);
      expect(result.segments.length).toBe(2);
      expect(result.segments[0]).toBe('https://example.com/seg1.ts');
    });

    it('should detect encryption', () => {
      const m3u8 = `
#EXTM3U
#EXT-X-KEY:METHOD=AES-128,URI="key.bin"
#EXTINF:9.0,
seg1.ts
      `.trim();
      const result = parseHlsPlaylist(m3u8, 'https://example.com/media.m3u8');
      expect(result.isEncrypted).toBe(true);
    });
  });
});
