/**
 * DASH parser.
 */

import { resolveUrl } from '../hls/hlsParser';

export interface DashRepresentation {
  id: string;
  bandwidth?: number;
  width?: number;
  height?: number;
  codecs?: string;
  mimeType?: string;
  url: string;
}

export interface DashInfo {
  isEncrypted: boolean;
  representations: DashRepresentation[];
}

/**
 * Parses DASH MPD file content.
 */
export function parseDashManifest(xmlContent: string, manifestUrl: string): DashInfo {
  const info: DashInfo = {
    isEncrypted: false,
    representations: []
  };

  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, 'application/xml');

    // 1. DRM check
    const contentProtections = xmlDoc.getElementsByTagName('ContentProtection');
    if (contentProtections.length > 0) {
      info.isEncrypted = true;
    }

    // 2. Parse representations
    const reps = xmlDoc.getElementsByTagName('Representation');
    for (let i = 0; i < reps.length; i++) {
      const rep = reps[i];
      const id = rep.getAttribute('id') || `rep-${i}`;
      const bandwidthAttr = rep.getAttribute('bandwidth');
      const widthAttr = rep.getAttribute('width');
      const heightAttr = rep.getAttribute('height');
      const codecs = rep.getAttribute('codecs') || undefined;
      const mimeType = rep.getAttribute('mimeType') || undefined;
      
      const bandwidth = bandwidthAttr ? parseInt(bandwidthAttr, 10) : undefined;
      const width = widthAttr ? parseInt(widthAttr, 10) : undefined;
      const height = heightAttr ? parseInt(heightAttr, 10) : undefined;

      // Extract BaseURL if present
      let url = manifestUrl;
      const baseUrlNodes = rep.getElementsByTagName('BaseURL');
      if (baseUrlNodes.length > 0 && baseUrlNodes[0].textContent) {
        url = resolveUrl(manifestUrl, baseUrlNodes[0].textContent.trim());
      } else {
        // Fallback check parent AdaptationSet BaseURL
        const parentNode = rep.parentNode;
        if (parentNode && parentNode.nodeName === 'AdaptationSet') {
          const parentBaseUrl = (parentNode as Element).getElementsByTagName('BaseURL');
          if (parentBaseUrl.length > 0 && parentBaseUrl[0].textContent) {
            url = resolveUrl(manifestUrl, parentBaseUrl[0].textContent.trim());
          }
        }
      }

      info.representations.push({
        id,
        bandwidth,
        width,
        height,
        codecs,
        mimeType,
        url
      });
    }

    // Sort by bandwidth descending
    info.representations.sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0));

  } catch (e) {
    console.error('Failed to parse DASH manifest:', e);
  }

  return info;
}
