import { toast } from 'sonner';
import { isDesktopApp } from './platform';

/** Make a string safe for use in a file name. */
export function safeFileName(name) {
  return String(name || 'export').replace(/[^a-z0-9]/gi, '_');
}

const EXT_LABELS = { pdf: 'PDF document', csv: 'CSV spreadsheet', json: 'JSON file', md: 'Markdown', txt: 'Text file', kml: 'KML', gpx: 'GPX' };

function extensionOf(filename) {
  const m = /\.([a-z0-9]+)$/i.exec(filename);
  return m ? m[1].toLowerCase() : '';
}

async function blobBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, /** @type {any} */ (bytes.subarray(i, i + 0x8000)));
  return btoa(s);
}

/**
 * Save in-memory content as a file, asking where to put it wherever the
 * platform allows: the desktop app shows the native save dialog, Chromium
 * browsers show the file picker, everything else downloads to the browser's
 * download folder. Resolves to true when a file was written, false when the
 * person cancelled.
 * @param {BlobPart} content
 * @param {string} filename
 * @param {string} mimeType
 */
export async function downloadBlob(content, filename, mimeType = 'application/octet-stream') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const ext = extensionOf(filename);
  try {
    if (isDesktopApp()) {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { invoke } = await import('@tauri-apps/api/core');
      const path = await save({ defaultPath: filename, filters: ext ? [{ name: EXT_LABELS[ext] || ext.toUpperCase(), extensions: [ext] }] : undefined });
      if (!path) return false;
      await invoke('save_file', { path, dataBase64: await blobBase64(blob) });
      toast.success('Saved', { description: path });
      return true;
    }
    const picker = /** @type {any} */ (window).showSaveFilePicker;
    if (typeof picker === 'function' && window.self === window.top) {
      try {
        const handle = await picker.call(window, { suggestedName: filename, types: ext ? [{ description: EXT_LABELS[ext] || ext.toUpperCase(), accept: { [mimeType || 'application/octet-stream']: [`.${ext}`] } }] : undefined });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return true;
      } catch (err) {
        if (err?.name === 'AbortError') return false;
        // Picker unavailable in this context (e.g. cross-origin restrictions): fall through to a plain download.
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch (err) {
    toast.error(`Could not save ${filename}: ${err?.message || 'unknown error'}`);
    return false;
  }
}
