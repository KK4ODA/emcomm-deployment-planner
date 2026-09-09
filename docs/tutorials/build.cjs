// Builds the tutorial documents from docs/tutorials/content/*.cjs.
//   node docs/tutorials/build.cjs            -> DOCX + Markdown for every tutorial
//   node docs/tutorials/build.cjs --pdf      -> also PDF through LibreOffice (soffice on PATH or the default Windows install)
// Screenshots live in docs/tutorials/img and are refreshed with the release they describe.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun, Table, TableRow, TableCell, WidthType, AlignmentType,
  BorderStyle, ShadingType, LevelFormat, PageBreak, PageNumber, Footer, Header, TabStopType,
} = require('docx');

const HERE = __dirname;
const IMG = path.join(HERE, 'img');
const pkg = JSON.parse(fs.readFileSync(path.join(HERE, '..', '..', 'package.json'), 'utf8'));
const APP_VERSION = pkg.version;
const wantPdf = process.argv.includes('--pdf');

const FONT = 'Calibri';
const INK = '1f2937';
const MUTED = '6b7280';
const ACCENT = '1e3a5f';
const TIP_BG = 'fff7ed';
const TIP_BORDER = 'f97316';
const TABLE_HEAD = 'e5e7eb';
const PAGE_W = 12240; const PAGE_H = 15840; const MARGIN = 1080; // US Letter, 0.75 in
const CONTENT_W = PAGE_W - 2 * MARGIN;

function imageSize(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), type: 'png' };
  // JPEG: walk the markers to the first SOF segment
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i += 1; continue; }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7), type: 'jpg' };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error('not a PNG or JPEG');
}

/** Inline markup: **bold**, *italic*, `code`. */
function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/g;
  let last = 0;
  for (const m of String(text).matchAll(re)) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), font: FONT, ...base }));
    const t = m[0];
    if (t.startsWith('**')) out.push(new TextRun({ text: t.slice(2, -2), bold: true, font: FONT, ...base }));
    else if (t.startsWith('`')) out.push(new TextRun({ text: t.slice(1, -1), font: 'Consolas', size: (base.size || 22) - 2, color: ACCENT, ...base }));
    else out.push(new TextRun({ text: t.slice(1, -1), italics: true, font: FONT, ...base }));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), font: FONT, ...base }));
  return out;
}

const para = (text, opts = {}) => new Paragraph({ children: runs(text, opts.run), spacing: { after: 120, line: 276 }, ...opts.p });
const h1 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text, font: FONT })], spacing: { before: 360, after: 160 } });
const h2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text, font: FONT })], spacing: { before: 280, after: 120 } });

function numbered(items, ref) {
  return items.map((t) => new Paragraph({ children: runs(t), numbering: { reference: ref, level: 0 }, spacing: { after: 80, line: 276 } }));
}
function bullets(items) {
  return items.map((t) => new Paragraph({ children: runs(t), numbering: { reference: 'bullets', level: 0 }, spacing: { after: 60, line: 276 } }));
}

function cell(text, { head = false, width, fill } = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: fill ? { type: ShadingType.CLEAR, fill, color: 'auto' } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ children: runs(text, head ? { bold: true, size: 20 } : { size: 20 }), spacing: { after: 0 } })],
  });
}

function table({ columns, rows, widths }) {
  const n = columns.length;
  const w = widths ? widths.map(f => Math.round(CONTENT_W * f)) : columns.map(() => Math.floor(CONTENT_W / n));
  const diff = CONTENT_W - w.reduce((a, b) => a + b, 0); w[w.length - 1] += diff;
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'd1d5db' };
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: w,
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows: [
      new TableRow({ tableHeader: true, children: columns.map((c, i) => cell(c, { head: true, width: w[i], fill: TABLE_HEAD })) }),
      ...rows.map(r => new TableRow({ children: r.map((c, i) => cell(String(c ?? ''), { width: w[i] })) })),
    ],
  });
}

function figure(name, caption, maxWidthIn = 6.9) {
  const file = ['jpg', 'png'].map(ext => path.join(IMG, `${name}.${ext}`)).find(f => fs.existsSync(f));
  if (!file) { console.warn('missing screenshot', name); return [para(`[screenshot ${name} missing]`, { run: { color: 'b91c1c' } })]; }
  const buf = fs.readFileSync(file);
  const { width, height, type } = imageSize(buf);
  // Keep at least ~150 dpi: narrow dialog crops are laid out narrower than full-screen frames.
  const MAX_H = 6.4; // inches: leave room for the caption on a Letter page
  const wIn = Math.min(maxWidthIn, 6.9, Math.max(3.5, width / 150), MAX_H * width / height);
  const px = Math.round(wIn * 96); const py = Math.round(px * height / width);
  const out = [
    new Paragraph({ children: [new ImageRun({ type, data: buf, transformation: { width: px, height: py } })], alignment: AlignmentType.CENTER, spacing: { before: 120, after: 60 }, keepNext: true }),
  ];
  if (caption) out.push(new Paragraph({ children: runs(caption, { italics: true, size: 18, color: MUTED }), alignment: AlignmentType.CENTER, spacing: { after: 200 } }));
  return out;
}

function tip(text, label = 'Tip') {
  const border = { style: BorderStyle.SINGLE, size: 12, color: TIP_BORDER };
  const none = { style: BorderStyle.NONE, size: 0, color: 'ffffff' };
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [CONTENT_W],
    borders: { top: none, bottom: none, right: none, left: border, insideHorizontal: none, insideVertical: none },
    rows: [new TableRow({ children: [new TableCell({
      width: { size: CONTENT_W, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill: TIP_BG, color: 'auto' },
      margins: { top: 100, bottom: 100, left: 160, right: 160 },
      children: [new Paragraph({ children: [new TextRun({ text: `${label}. `, bold: true, font: FONT, size: 20, color: '9a3412' }), ...runs(text, { size: 20 })], spacing: { after: 0, line: 264 } })],
    })] })],
  });
}

function spacer() { return new Paragraph({ children: [], spacing: { after: 120 } }); }

/** Turns one content module into docx children. */
function render(doc) {
  const kids = [];
  // Title page
  kids.push(new Paragraph({ children: [new TextRun({ text: 'EmComm Planner tutorial', font: FONT, size: 24, color: MUTED, allCaps: true, characterSpacing: 20 })], spacing: { before: 2400, after: 200 } }));
  kids.push(new Paragraph({ children: [new TextRun({ text: doc.title, font: FONT, size: 56, bold: true, color: ACCENT })], spacing: { after: 200 } }));
  kids.push(new Paragraph({ children: [new TextRun({ text: doc.subtitle, font: FONT, size: 28, color: INK })], spacing: { after: 600 } }));
  for (const line of doc.titleLines || []) kids.push(para(line, { run: { size: 22, color: MUTED } }));
  kids.push(para(`Written for EmComm Planner ${APP_VERSION}. Screenshots come from the same version, so what you see should match this guide. The live guide is at emcommplanner.org/guide.`, { run: { size: 20, color: MUTED }, p: { spacing: { before: 400 } } }));
  kids.push(new Paragraph({ children: [new PageBreak()] }));

  let stepNo = 0;
  for (const sec of doc.sections) {
    if (sec.step) { stepNo += 1; kids.push(h1(`Step ${stepNo}. ${sec.h}`)); } else kids.push(h1(sec.h));
    for (const block of sec.blocks) {
      if (typeof block === 'string') { kids.push(para(block)); continue; }
      if (block.h2) kids.push(h2(block.h2));
      if (block.p) kids.push(para(block.p));
      if (block.do) { kids.push(para('**Do this**', { p: { spacing: { after: 60 } } })); kids.push(...numbered(block.do, `steps-${sec.key}-${kids.length}`)); }
      if (block.enter) { kids.push(para('**Enter this**', { p: { spacing: { after: 60 }, keepNext: true } })); kids.push(table(block.enter)); kids.push(spacer()); }
      if (block.table) { kids.push(table(block.table)); kids.push(spacer()); }
      if (block.bullets) kids.push(...bullets(block.bullets));
      if (block.img) kids.push(...figure(block.img, block.caption, block.width));
      if (block.tip) { kids.push(tip(block.tip, block.tipLabel)); kids.push(spacer()); }
      if (block.why) { kids.push(tip(block.why, 'Why it matters')); kids.push(spacer()); }
      if (block.pageBreak) kids.push(new Paragraph({ children: [new PageBreak()] }));
    }
  }
  return kids;
}

function numberingConfig(doc) {
  const refs = [];
  doc.sections.forEach((sec) => { let i = 0; sec.blocks.forEach(() => { i += 1; }); });
  // One decimal list per "Do this" block: reference names are generated at render time from kids.length,
  // so we register a generous pool of names and reuse the same definition.
  const configs = [{ reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 260 } } } }] }];
  return { configs, refs };
}

async function buildOne(mod) {
  const doc = require(mod);
  // Pre-render to discover numbering references (each "Do this" list restarts at 1).
  const kids = render(doc);
  const refNames = new Set();
  for (const k of kids) { const r = k?.numbering?.reference || k?.properties?.numbering?.reference; if (r && r !== 'bullets') refNames.add(r); }
  // docx keeps numbering in the paragraph's options; read them back through the root
  const found = new Set();
  const scan = (obj) => { if (!obj || typeof obj !== 'object') return; if (obj.reference && typeof obj.reference === 'string' && obj.reference.startsWith('steps-')) found.add(obj.reference); for (const v of Object.values(obj)) if (v && typeof v === 'object') scan(v); };
  kids.forEach(scan);
  const stepRefs = [...found];
  const { configs } = numberingConfig(doc);
  for (const ref of stepRefs) configs.push({ reference: ref, levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 360 } } } }] });

  const d = new Document({
    creator: 'EmComm Planner', title: doc.title, description: doc.subtitle,
    styles: {
      default: { document: { run: { font: FONT, size: 22, color: INK } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 34, bold: true, color: ACCENT, font: FONT }, paragraph: { spacing: { before: 360, after: 160 }, outlineLevel: 0 } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 26, bold: true, color: INK, font: FONT }, paragraph: { spacing: { before: 240, after: 100 }, outlineLevel: 1 } },
      ],
    },
    numbering: { config: configs },
    sections: [{
      properties: { page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } },
      headers: { default: new Header({ children: [new Paragraph({ children: [new TextRun({ text: `${doc.title}  ·  EmComm Planner ${APP_VERSION}`, font: FONT, size: 16, color: MUTED })], alignment: AlignmentType.RIGHT })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ children: [new TextRun({ text: 'Page ', font: FONT, size: 16, color: MUTED }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: MUTED })], alignment: AlignmentType.CENTER })] }) },
      children: kids,
    }],
  });
  const out = path.join(HERE, `${doc.file}.docx`);
  fs.writeFileSync(out, await Packer.toBuffer(d));
  fs.writeFileSync(path.join(HERE, `${doc.file}.md`), toMarkdown(doc));
  console.log('wrote', path.basename(out));
  if (wantPdf) {
    const soffice = process.platform === 'win32' ? 'C:/Program Files/LibreOffice/program/soffice.exe' : 'soffice';
    execFileSync(soffice, ['--headless', '--convert-to', 'pdf', '--outdir', HERE, out], { stdio: 'ignore' });
    console.log('wrote', `${doc.file}.pdf`);
  }
}

function toMarkdown(doc) {
  const L = [`# ${doc.title}`, '', `*${doc.subtitle}*`, '', ...(doc.titleLines || []).map(l => `> ${l}`), '', `Written for EmComm Planner ${APP_VERSION}. Live guide: https://emcommplanner.org/guide`, ''];
  let stepNo = 0;
  const mdTable = (t) => ['', `| ${t.columns.join(' | ')} |`, `| ${t.columns.map(() => '---').join(' | ')} |`, ...t.rows.map(r => `| ${r.map(c => String(c ?? '').replace(/\|/g, '\\|')).join(' | ')} |`), ''];
  for (const sec of doc.sections) {
    if (sec.step) { stepNo += 1; L.push(`## Step ${stepNo}. ${sec.h}`, ''); } else L.push(`## ${sec.h}`, '');
    for (const b of sec.blocks) {
      if (typeof b === 'string') { L.push(b, ''); continue; }
      if (b.h2) L.push(`### ${b.h2}`, '');
      if (b.p) L.push(b.p, '');
      if (b.do) { L.push('**Do this**', '', ...b.do.map((s, i) => `${i + 1}. ${s}`), ''); }
      if (b.enter) { L.push('**Enter this**'); L.push(...mdTable(b.enter)); }
      if (b.table) L.push(...mdTable(b.table));
      if (b.bullets) L.push(...b.bullets.map(s => `- ${s}`), '');
      if (b.img) L.push(`![${b.caption || b.img}](img/${b.img}.jpg)`, '', ...(b.caption ? [`*${b.caption}*`, ''] : []));
      if (b.tip) L.push(`> **${b.tipLabel || 'Tip'}.** ${b.tip}`, '');
      if (b.why) L.push(`> **Why it matters.** ${b.why}`, '');
    }
  }
  return L.join('\n');
}

(async () => {
  const dir = path.join(HERE, 'content');
  const only = process.argv.find(a => a.startsWith('--only='))?.slice(7);
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.cjs'))) {
    if (only && !f.startsWith(only)) continue;
    await buildOne(path.join(dir, f));
  }
})();
