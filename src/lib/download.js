/** Make a string safe for use in a file name. */
export function safeFileName(name) {
  return String(name || 'export').replace(/[^a-z0-9]/gi, '_');
}

/**
 * Trigger a browser download of in-memory content.
 * @param {BlobPart} content
 * @param {string} filename
 * @param {string} mimeType
 */
export function downloadBlob(content, filename, mimeType = 'application/octet-stream') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
