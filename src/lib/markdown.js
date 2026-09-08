/**
 * The smallest Markdown reader the user guide needs: headings, paragraphs,
 * bullet lists, horizontal rules, and inline bold, italic, code and links.
 * The source is our own file, and the output is a block list rendered as
 * React elements, so nothing is ever turned into raw HTML.
 */

/**
 * @typedef {{ type: 'heading', level: number, text: string, id: string }
 *   | { type: 'paragraph', text: string }
 *   | { type: 'list', items: string[] }
 *   | { type: 'rule' }} MarkdownBlock
 */

/** URL-safe anchor for a heading; leading list numbers are dropped. */
export function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[*`_]/g, '')
    .replace(/^\s*\d+(\.\d+)*\.?\s+/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * @param {string} source
 * @returns {MarkdownBlock[]}
 */
export function parseMarkdown(source) {
  /** @type {MarkdownBlock[]} */
  const blocks = [];
  /** @type {string[]} */
  let para = [];
  /** @type {string[]} */
  let list = [];
  const used = new Map();

  const flushPara = () => { if (para.length) { blocks.push({ type: 'paragraph', text: para.join(' ') }); para = []; } };
  const flushList = () => { if (list.length) { blocks.push({ type: 'list', items: list }); list = []; } };
  const uniqueId = (text) => {
    const base = slugify(text) || 'section';
    const n = used.get(base) || 0;
    used.set(base, n + 1);
    return n ? `${base}-${n + 1}` : base;
  };

  for (const raw of String(source).split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushPara(); flushList();
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2].trim(), id: uniqueId(heading[2]) });
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) { flushPara(); flushList(); blocks.push({ type: 'rule' }); continue; }
    const item = /^\s*[-*]\s+(.*)$/.exec(line);
    if (item) { flushPara(); list.push(item[1]); continue; }
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if (list.length && /^\s{2,}\S/.test(raw)) { list[list.length - 1] += ` ${line.trim()}`; continue; }
    flushList();
    para.push(line.trim());
  }
  flushPara(); flushList();
  return blocks;
}

/**
 * @typedef {{ type: 'text' | 'strong' | 'em' | 'code', text: string } | { type: 'link', text: string, href: string }} InlineToken
 */

const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|\[[^\]]+\]\([^)\s]+\))/g;

/**
 * @param {string} text
 * @returns {InlineToken[]}
 */
export function parseInline(text) {
  /** @type {InlineToken[]} */
  const out = [];
  let last = 0;
  for (const m of String(text).matchAll(INLINE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ type: 'text', text: text.slice(last, idx) });
    const tok = m[0];
    if (tok.startsWith('`')) out.push({ type: 'code', text: tok.slice(1, -1) });
    else if (tok.startsWith('**')) out.push({ type: 'strong', text: tok.slice(2, -2) });
    else if (tok.startsWith('[')) {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok);
      if (link) out.push({ type: 'link', text: link[1], href: link[2] });
    } else out.push({ type: 'em', text: tok.slice(1, -1) });
    last = idx + tok.length;
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
  return out;
}

/** Headings of one level, for a table of contents. */
export function outline(blocks, level = 2) {
  return blocks.flatMap(b => (b.type === 'heading' && b.level === level ? [{ id: b.id, text: b.text }] : []));
}
