import { describe, it, expect } from 'vitest';
import { parseDashManifest } from './dashParser';

describe('dashParser', () => {
  describe('parseDashManifest', () => {
    it('should parse basic DASH manifest', () => {
      const xml = `
<MPD>
  <Period>
    <AdaptationSet>
      <Representation id="1" bandwidth="1000000" width="1920" height="1080">
        <BaseURL>1080p.mp4</BaseURL>
      </Representation>
      <Representation id="2" bandwidth="500000" width="1280" height="720">
        <BaseURL>720p.mp4</BaseURL>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>
      `.trim();
      const result = parseDashManifest(xml, 'https://example.com/manifest.mpd');
      expect(result.representations.length).toBe(2);
      expect(result.representations[0].width).toBe(1920);
      expect(result.representations[0].url).toBe('https://example.com/1080p.mp4');
    });

    it('should detect DRM ContentProtection', () => {
      const xml = `
<MPD>
  <Period>
    <AdaptationSet>
      <ContentProtection schemeIdUri="urn:mpeg:dash:mp4protection:2011" value="cenc" />
      <Representation id="1">
        <BaseURL>enc.mp4</BaseURL>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>
      `.trim();
      const result = parseDashManifest(xml, 'https://example.com/manifest.mpd');
      expect(result.isEncrypted).toBe(true);
    });
  });
});
