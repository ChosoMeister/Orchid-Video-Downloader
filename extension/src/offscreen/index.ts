/**
 * Offscreen document script for Chrome Manifest V3.
 */

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const { type, data } = message;

  if (type === 'CREATE_BLOB_URL') {
    try {
      const blob = new Blob([data.buffer], { type: data.mimeType });
      const blobUrl = URL.createObjectURL(blob);
      sendResponse({ success: true, blobUrl });
    } catch (e: any) {
      sendResponse({ success: false, error: e.message });
    }
    return true;
  }
  return false;
});
