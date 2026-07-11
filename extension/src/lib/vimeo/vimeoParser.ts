/**
 * Vimeo JSON playlist parser.
 */

import { resolveUrl } from '../hls/hlsParser';

export interface VimeoSegment {
  start: number;
  end: number;
  url: string;
  size: number;
}

export interface VimeoTrack {
  id: string;
  width?: number;
  height?: number;
  codecs?: string;
  bitrate?: number;
  mimeType?: string;
  initSegment: string; // base64 string
  segments: VimeoSegment[];
}

export interface VimeoPlaylistInfo {
  clipId: string;
  videoTracks: VimeoTrack[];
  audioTracks: VimeoTrack[];
}

/**
 * Parses Vimeo's custom adaptive JSON playlist (playlist.json).
 */
export function parseVimeoPlaylist(jsonContent: string, playlistUrl: string): VimeoPlaylistInfo {
  const data = JSON.parse(jsonContent);

  const rawBaseUrl = data.base_url || '';
  const base = resolveUrl(playlistUrl, rawBaseUrl);

  const parseTrack = (t: any): VimeoTrack => {
    const trackBaseUrl = t.base_url || '';
    const trackBase = resolveUrl(base, trackBaseUrl);

    const segments: VimeoSegment[] = (t.segments || []).map((seg: any) => {
      return {
        start: seg.start || 0,
        end: seg.end || 0,
        url: resolveUrl(trackBase, seg.url),
        size: seg.size || 0
      };
    });

    return {
      id: t.id || '',
      width: t.width ? parseInt(t.width, 10) : undefined,
      height: t.height ? parseInt(t.height, 10) : undefined,
      codecs: t.codecs || undefined,
      bitrate: t.bitrate ? parseInt(t.bitrate, 10) : undefined,
      mimeType: t.mime_type || undefined,
      initSegment: t.init_segment || '',
      segments
    };
  };

  const videoTracks: VimeoTrack[] = (data.video || []).map(parseTrack);
  const audioTracks: VimeoTrack[] = (data.audio || []).map(parseTrack);

  // Sort video tracks by height, width, then bitrate descending
  videoTracks.sort((a, b) => {
    const heightDiff = (b.height || 0) - (a.height || 0);
    if (heightDiff !== 0) return heightDiff;
    const widthDiff = (b.width || 0) - (a.width || 0);
    if (widthDiff !== 0) return widthDiff;
    return (b.bitrate || 0) - (a.bitrate || 0);
  });

  // Sort audio tracks by bitrate descending
  audioTracks.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

  return {
    clipId: data.clip_id || '',
    videoTracks,
    audioTracks
  };
}
