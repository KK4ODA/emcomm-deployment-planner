/**
 * Type-scale control. Everything is sized in rem, so changing the root font
 * size scales the whole app; the choice lives on the device (it is about the
 * reader's eyes, not their account).
 */
export const TEXT_SIZES = Object.freeze([
  { id: 'compact', label: 'Compact', px: 14 },
  { id: 'default', label: 'Default', px: 16 },
  { id: 'large', label: 'Large', px: 18 },
  { id: 'larger', label: 'Larger', px: 20 },
]);
export const TEXT_SIZE_KEY = 'emcomm_text_size';

export function getTextSize() {
  try {
    const id = window.localStorage.getItem(TEXT_SIZE_KEY);
    return TEXT_SIZES.some(t => t.id === id) ? /** @type {string} */ (id) : 'default';
  } catch { return 'default'; }
}

/** Apply a size to the document root and remember it. */
export function setTextSize(id) {
  const size = TEXT_SIZES.find(t => t.id === id) || TEXT_SIZES[1];
  document.documentElement.style.fontSize = size.id === 'default' ? '' : `${size.px}px`;
  document.documentElement.dataset.textSize = size.id;
  try { window.localStorage.setItem(TEXT_SIZE_KEY, size.id); } catch { /* private mode */ }
  window.dispatchEvent(new CustomEvent('emcomm:text-size', { detail: size.id }));
  return size.id;
}

/** Call once at startup so the first paint already uses the stored size. */
export function applyStoredTextSize() {
  const id = getTextSize();
  const size = TEXT_SIZES.find(t => t.id === id) || TEXT_SIZES[1];
  document.documentElement.style.fontSize = size.id === 'default' ? '' : `${size.px}px`;
  document.documentElement.dataset.textSize = size.id;
  return size.id;
}
