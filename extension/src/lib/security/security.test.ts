import { describe, it, expect } from 'vitest';
import { validateUrl, redactUrlParams, sanitizeFilename } from './security';

describe('security', () => {
  describe('validateUrl', () => {
    it('should allow https urls', () => {
      const result = validateUrl('https://example.com/video.mp4');
      expect(result.isValid).toBe(true);
    });

    it('should reject file urls', () => {
      const result = validateUrl('file:///etc/passwd');
      expect(result.isValid).toBe(false);
    });

    it('should reject private IPs without allowDev', () => {
      const result = validateUrl('http://192.168.1.100/video.m3u8');
      expect(result.isValid).toBe(false);
    });
  });

  describe('redactUrlParams', () => {
    it('should redact sensitive params', () => {
      const url = 'https://example.com/video.m3u8?token=12345&session=abcde&format=hls';
      const result = redactUrlParams(url);
      expect(result).toContain('token=%5BREDACTED%5D');
      expect(result).toContain('session=%5BREDACTED%5D');
      expect(result).toContain('format=hls');
    });
  });

  describe('sanitizeFilename', () => {
    it('should remove invalid characters', () => {
      const filename = 'my:video/file?.mp4';
      const result = sanitizeFilename(filename);
      expect(result).toBe('my_video_file_.mp4');
    });

    it('should remove leading dots', () => {
      const filename = '..hidden.mp4';
      const result = sanitizeFilename(filename);
      expect(result).toBe('hidden.mp4');
    });
  });
});
