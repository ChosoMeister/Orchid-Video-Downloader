import { describe, it, expect } from 'vitest';
import { parseVimeoPlaylist } from '../extension/src/lib/vimeo/vimeoParser';

describe('Vimeo Parser', () => {
  it('should parse Vimeo JSON playlist and sort tracks correctly', () => {
    const json = JSON.stringify({
      clip_id: 'c12345',
      base_url: '../range/',
      video: [
        {
          id: 'vid-low',
          width: 640,
          height: 360,
          bitrate: 500000,
          init_segment: 'base64low',
          segments: [
            { start: 0, end: 5, url: 'low-1.mp4', size: 100 }
          ]
        },
        {
          id: 'vid-high',
          width: 1920,
          height: 1080,
          bitrate: 4000000,
          init_segment: 'base64high',
          segments: [
            { start: 0, end: 5, url: 'high-1.mp4', size: 500 }
          ]
        }
      ],
      audio: [
        {
          id: 'aud-primary',
          bitrate: 128000,
          init_segment: 'base64audio',
          segments: [
            { start: 0, end: 5, url: 'aud-1.mp4', size: 50 }
          ]
        }
      ]
    });

    const playlistUrl = 'https://example.com/vod/playlist.json';
    const info = parseVimeoPlaylist(json, playlistUrl);

    expect(info.clipId).toBe('c12345');
    expect(info.videoTracks.length).toBe(2);
    
    // Highest resolution should be sorted first
    expect(info.videoTracks[0].id).toBe('vid-high');
    expect(info.videoTracks[0].initSegment).toBe('base64high');
    expect(info.videoTracks[0].segments[0].url).toBe('https://example.com/range/high-1.mp4');

    expect(info.audioTracks.length).toBe(1);
    expect(info.audioTracks[0].id).toBe('aud-primary');
    expect(info.audioTracks[0].segments[0].url).toBe('https://example.com/range/aud-1.mp4');
  });
});
