/**
 * HLS parser and relative URL resolver.
 */

export interface HlsVariant {
  url: string;
  bandwidth?: number;
  avgBandwidth?: number;
  resolution?: string;
  codecs?: string;
  frameRate?: number;
}

export interface HlsPlaylistInfo {
  isMaster: boolean;
  variants: HlsVariant[];
  segments: string[];
  isEncrypted: boolean;
  encryptionMethod?: string;
  isLive: boolean;
}

/**
 * Resolves a target URL relative to a base URL.
 */
export function resolveUrl(baseUrl: string, targetUrl: string): string {
  try {
    return new URL(targetUrl, baseUrl).toString();
  } catch (e) {
    return targetUrl;
  }
}

/**
 * Parses HLS playlist content.
 */
export function parseHlsPlaylist(content: string, manifestUrl: string): HlsPlaylistInfo {
  const lines = content.split(/\r?\n/).map(line => line.trim());
  
  const isMaster = lines.some(line => line.startsWith('#EXT-X-STREAM-INF'));
  const hasEndList = lines.some(line => line.startsWith('#EXT-X-ENDLIST'));
  
  const info: HlsPlaylistInfo = {
    isMaster,
    variants: [],
    segments: [],
    isEncrypted: false,
    isLive: !isMaster && !hasEndList
  };

  if (isMaster) {
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (line.startsWith('#EXT-X-STREAM-INF:')) {
        const attributes = parseAttributes(line.substring(18));
        i++;
        // Find next non-empty non-comment line for the URL
        while (i < lines.length && (lines[i].startsWith('#') || lines[i] === '')) {
          i++;
        }
        if (i < lines.length) {
          const variantUrl = resolveUrl(manifestUrl, lines[i]);
          
          let resolution = attributes['RESOLUTION'];
          let bandwidth = attributes['BANDWIDTH'] ? parseInt(attributes['BANDWIDTH'], 10) : undefined;
          let avgBandwidth = attributes['AVERAGE-BANDWIDTH'] ? parseInt(attributes['AVERAGE-BANDWIDTH'], 10) : undefined;
          let codecs = attributes['CODECS'];
          let frameRate = attributes['FRAME-RATE'] ? parseFloat(attributes['FRAME-RATE']) : undefined;

          // Strip quotes from codecs if present
          if (codecs && codecs.startsWith('"') && codecs.endsWith('"')) {
            codecs = codecs.slice(1, -1);
          }

          info.variants.push({
            url: variantUrl,
            bandwidth,
            avgBandwidth,
            resolution,
            codecs,
            frameRate
          });
        }
      }
      i++;
    }

    // Sort variants by bandwidth descending
    info.variants.sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0));
  } else {
    // Parse media playlist segments
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      
      // Check for encryption keys
      if (line.startsWith('#EXT-X-KEY:')) {
        const attributes = parseAttributes(line.substring(11));
        const method = attributes['METHOD'];
        if (method && method !== 'NONE') {
          info.isEncrypted = true;
          info.encryptionMethod = method;
        }
      }

      // Check for stream segments
      if (line.startsWith('#EXTINF:')) {
        i++;
        while (i < lines.length && (lines[i].startsWith('#') || lines[i] === '')) {
          // If we encounter a key inside the segments, process it
          if (lines[i].startsWith('#EXT-X-KEY:')) {
            const attributes = parseAttributes(lines[i].substring(11));
            const method = attributes['METHOD'];
            if (method && method !== 'NONE') {
              info.isEncrypted = true;
              info.encryptionMethod = method;
            }
          }
          i++;
        }
        if (i < lines.length) {
          info.segments.push(resolveUrl(manifestUrl, lines[i]));
        }
      }
      i++;
    }
  }

  return info;
}

/**
 * Parses comma-separated attributes from tags like #EXT-X-STREAM-INF or #EXT-X-KEY
 * E.g., BANDWIDTH=1280000,RESOLUTION=960x540,CODECS="avc1.42e00a,mp4a.40.2"
 */
function parseAttributes(attrString: string): Record<string, string> {
  const result: Record<string, string> = {};
  let currentKey = '';
  let currentValue = '';
  let inQuotes = false;
  let isKey = true;

  for (let i = 0; i < attrString.length; i++) {
    const char = attrString[i];

    if (char === '"') {
      inQuotes = !inQuotes;
      currentValue += char;
    } else if (char === '=' && !inQuotes && isKey) {
      isKey = false;
    } else if (char === ',' && !inQuotes) {
      result[currentKey.trim()] = currentValue.trim();
      currentKey = '';
      currentValue = '';
      isKey = true;
    } else {
      if (isKey) {
        currentKey += char;
      } else {
        currentValue += char;
      }
    }
  }

  if (currentKey) {
    result[currentKey.trim()] = currentValue.trim();
  }

  // Strip wrapping quotes for ease of use
  for (const key of Object.keys(result)) {
    const val = result[key];
    if (val.startsWith('"') && val.endsWith('"')) {
      result[key] = val.slice(1, -1);
    }
  }

  return result;
}
