import { formatDateTime } from '@/lib/time';

/** Shared page scaffolding for the record forms (ICS 214 / 205A). */
async function openDoc(title, deployment, period, extraBoxes = []) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentW = pageW - margin * 2;
  let y = margin;
  const text = (s, x, yy, opts = {}) => doc.text(String(s ?? ''), x, yy, opts);

  doc.setFont('helvetica', 'bold').setFontSize(13);
  text(title, margin, y + 5);
  doc.setFont('helvetica', 'normal').setFontSize(8);
  text(`Generated ${formatDateTime(new Date())}`, pageW - margin, y + 5, { align: 'right' });
  y += 9;

  const boxes = [
    ['1. Incident Name', deployment.name || ''],
    ['2. Operational Period', `${formatDateTime(period?.starts_at || deployment.starts_at) || '—'} to ${formatDateTime(period?.ends_at || deployment.ends_at) || '—'}`],
    ...extraBoxes,
  ];
  const boxW = contentW / boxes.length;
  boxes.forEach(([label, value], i) => {
    const x = margin + i * boxW;
    doc.rect(x, y, boxW, 12);
    doc.setFontSize(7).setFont('helvetica', 'bold');
    text(label, x + 1.5, y + 3.5);
    doc.setFontSize(9).setFont('helvetica', 'normal');
    text(doc.splitTextToSize(value, boxW - 3)[0] || '', x + 1.5, y + 9);
  });
  y += 15;

  const state = { doc, pageW, pageH, margin, contentW, y };
  const footer = (label) => {
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setFontSize(7).setTextColor(120);
      text(`${label}  ·  ${deployment.name}  ·  page ${p} of ${pages}  ·  EmComm Planner`, pageW - margin, pageH - 4, { align: 'right' });
      doc.setTextColor(0);
    }
  };
  return { ...state, text, footer };
}

/**
 * Draw a wrapping table. Columns: [{ label, width (relative), key }].
 * @returns {number} the y after the table
 */
function drawTable(ctx, columns, rows, startY) {
  const { doc, margin, contentW, pageH } = ctx;
  let y = startY;
  const totalW = columns.reduce((s, c) => s + c.width, 0);
  const scale = contentW / totalW;
  const lineH = 3.6;
  const header = () => {
    let x = margin;
    doc.setFillColor(230, 230, 230);
    doc.rect(margin, y, contentW, 7, 'F');
    doc.setFont('helvetica', 'bold').setFontSize(7.5);
    for (const c of columns) { const w = c.width * scale; doc.rect(x, y, w, 7); doc.text(c.label, x + 1, y + 4.6); x += w; }
    y += 7;
  };
  header();
  doc.setFont('helvetica', 'normal').setFontSize(8);
  for (const row of (rows.length ? rows : [{}])) {
    const cells = columns.map(c => doc.splitTextToSize(String(row[c.key] ?? ''), c.width * scale - 2));
    const rowH = Math.max(6.5, Math.max(...cells.map(l => l.length)) * lineH + 2.5);
    if (y + rowH > pageH - 24) { doc.addPage(); y = margin; header(); doc.setFont('helvetica', 'normal').setFontSize(8); }
    let x = margin;
    columns.forEach((c, i) => { const w = c.width * scale; doc.rect(x, y, w, rowH); doc.text(cells[i], x + 1, y + 4.2); x += w; });
    y += rowH;
  }
  return y;
}

function preparedBy(ctx, y, name, position) {
  const { doc, margin, contentW, pageH, text } = ctx;
  if (y + 16 > pageH - 14) { doc.addPage(); y = margin; }
  doc.rect(margin, y + 3, contentW, 12);
  doc.setFont('helvetica', 'bold').setFontSize(7);
  text('Prepared by', margin + 1.5, y + 6.5);
  doc.setFont('helvetica', 'normal').setFontSize(9);
  text(`Name: ${name || ''}     Position/Title: ${position || ''}     Date/Time: ${formatDateTime(new Date())}`, margin + 1.5, y + 12);
}

/**
 * ICS 214 Activity Log for a unit (whole deployment) or one person.
 * @param {{ deployment: Object, period?: Object|null, entries: Array<{ at: string, text: string }>, person?: { name: string, callSign?: string, position?: string }|null, preparedByName?: string }} params
 */
export async function renderIcs214Pdf({ deployment, period, entries, person = null, preparedByName = '' }) {
  const ctx = await openDoc('ACTIVITY LOG (ICS 214)', deployment, period, [
    ['3. Name / Unit', person ? `${person.name}${person.callSign ? ` (${person.callSign})` : ''}` : `${deployment.name} communications unit`],
    ['4. ICS Position', person?.position || 'Communications'],
  ]);
  ctx.doc.setFont('helvetica', 'bold').setFontSize(8);
  ctx.text('7. Activity Log', ctx.margin, ctx.y + 3);
  let y = ctx.y + 5;
  y = drawTable(ctx, [{ label: 'Date/Time', width: 22, key: 'when' }, { label: 'Notable Activities', width: 78, key: 'text' }],
    entries.map(e => ({ when: formatDateTime(e.at, 'MM/dd HH:mm'), text: e.text })), y);
  preparedBy(ctx, y + 4, preparedByName, person ? person.position || 'Operator' : 'COML');
  ctx.footer('ICS 214');
  return ctx.doc.output('blob');
}

/**
 * ICS 205A Communications List: staffed positions with names, call signs and
 * contact methods, generated from assignments (doctrinally "completed during
 * check-in").
 * @param {{ deployment: Object, period?: Object|null, rows: Array<{ position: string, tactical: string, name: string, callSign: string, method: string, net: string }>, preparedByName?: string }} params
 */
export async function renderIcs205aPdf({ deployment, period, rows, preparedByName = '' }) {
  const ctx = await openDoc('COMMUNICATIONS LIST (ICS 205A)', deployment, period);
  ctx.doc.setFont('helvetica', 'bold').setFontSize(8);
  ctx.text('3. Basic Local Communications Information', ctx.margin, ctx.y + 3);
  let y = ctx.y + 5;
  y = drawTable(ctx, [
    { label: 'Incident Assigned Position', width: 30, key: 'position' },
    { label: 'Tactical', width: 16, key: 'tactical' },
    { label: 'Name', width: 26, key: 'name' },
    { label: 'Call sign', width: 16, key: 'callSign' },
    { label: 'Method(s) of contact', width: 30, key: 'method' },
    { label: 'Net', width: 12, key: 'net' },
  ], rows, y);
  preparedBy(ctx, y + 4, preparedByName, 'COML');
  ctx.footer('ICS 205A');
  return ctx.doc.output('blob');
}
