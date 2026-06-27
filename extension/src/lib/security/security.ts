/**
 * Security validation and redaction library.
 */

const PRIVATE_IP_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/,
  /^fe80:/
];

const SENSITIVE_PARAMS = [
  'token',
  'signature',
  'policy',
  'key',
  'authorization',
  'auth',
  'expires',
  'jwt',
  'session',
  'sig'
];

/**
 * Validates that a URL is safe for detection and downloading.
 * Must be http or https, and not point to localhost, private IP, or browser internals.
 */
export function validateUrl(urlString: string, allowDev = false): { isValid: boolean; reason?: string } {
  try {
    const url = new URL(urlString);
    
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { isValid: false, reason: 'Only http and https protocols are allowed.' };
    }

    const hostname = url.hostname.toLowerCase();

    if (hostname === 'localhost' || hostname === 'loopback') {
      if (!allowDev) {
        return { isValid: false, reason: 'Localhost targets are not allowed.' };
      }
    }

    for (const regex of PRIVATE_IP_RANGES) {
      if (regex.test(hostname)) {
        if (!allowDev) {
          return { isValid: false, reason: 'Private IP networks are blocked.' };
        }
      }
    }

    return { isValid: true };
  } catch (e) {
    return { isValid: false, reason: 'Invalid URL format.' };
  }
}

/**
 * Redacts sensitive parameters from a URL's search query for logging/UI display.
 */
export function redactUrlParams(urlString: string): string {
  try {
    const url = new URL(urlString);
    let modified = false;

    for (const param of SENSITIVE_PARAMS) {
      if (url.searchParams.has(param)) {
        url.searchParams.set(param, '[REDACTED]');
        modified = true;
      }
    }

    // Also scan case-insensitive
    const keysToRedact: string[] = [];
    url.searchParams.forEach((_, key) => {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_PARAMS.some(p => lowerKey.includes(p)) && !keysToRedact.includes(key)) {
        keysToRedact.push(key);
      }
    });

    for (const key of keysToRedact) {
      url.searchParams.set(key, '[REDACTED]');
      modified = true;
    }

    return modified ? url.toString() : urlString;
  } catch (e) {
    return urlString;
  }
}

/**
 * Clean and sanitize a filename to prevent directory traversal or invalid characters.
 */
export function sanitizeFilename(filename: string, fallback = 'download'): string {
  if (!filename) return fallback;
  
  // Replace invalid characters: / \ ? % * : | " < > .
  let clean = filename
    .replace(/[\\/:*?"<>|%]/g, '_')
    .replace(/^\.+/, '') // No leading dots
    .trim();
    
  if (clean.length === 0) {
    return fallback;
  }

  // Cap length
  if (clean.length > 200) {
    clean = clean.substring(0, 200);
  }

  return clean;
}
