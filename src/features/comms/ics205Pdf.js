import { formatDateTime } from '@/lib/time';
import { groupByCondition, CONDITIONS, PATH_ROLES, digitalModeLabel } from '@/lib/comms';

export const CHANNEL_COLUMNS = [
  { key: 'zone_group', label: 'Zone/Grp', width: 14 },
  { key: 'channel_number', label: 'Ch #', width: 10 },
  { key: 'function', label: 'Function', width: 22 },
  { key: 'channel_name', label: 'Channel Name', width: 32 },
  { key: 'assignment', label: 'Assignment', width: 34 },
  { key: 'rx', label: 'RX Freq  N/W', width: 24 },
  { key: 'rx_tone', label: 'RX Tone/NAC', width: 18 },
  { key: 'tx', label: 'TX Freq  N/W', width: 24 },
  { key: 'tx_tone', label: 'TX Tone/NAC', width: 18 },
  { key: 'mode', label: 'Mode', width: 12 },
  { key: 'remarks', label: 'Remarks', width: 42 },
];

const fmtFreq = (v, bw) => (v == null || v === '' ? '' : `${Number(v).toFixed(4)}${bw ? ` ${bw}` : ''}`);
export const modeLabel = (mode) => ({ A: 'A', D: 'D', M: 'M' }[mode] || mode || '');

function cellValue(row, key) {
  switch (key) {
    case 'rx': return row.config === 'phone' ? (row.phone_number || '') : fmtFreq(row.rx_freq, row.rx_bandwidth);
    case 'tx': return row.config === 'phone' ? '' : fmtFreq(row.tx_freq ?? row.rx_freq, row.tx_bandwidth);
    case 'mode': return modeLabel(row.mode);
    case 'remarks': {
      const bits = [];
      if (row.path_role && row.path_role !== 'primary') bits.push(PATH_ROLES[row.path_role]?.label);
      if (row.mode === 'D' && row.digital_mode) bits.push(digitalModeLabel(row.digital_mode));
      if (row.gateway_callsign) bits.push(`via ${row.gateway_callsign}`);
      if (row.tactical_address) bits.push(row.tactical_address);
      if (row.owner_callsign) bits.push(row.owner_callsign);
      if (row.timeout_seconds) bits.push(`TOT ${row.timeout_seconds}s`);
      if (row.remarks) bits.push(row.remarks);
      return bits.filter(Boolean).join(' · ');
    }
    default: return row[key] ?? '';
  }
}

/**
 * Render an ICS 205 (Incident Radio Communications Plan) as a landscape
 * letter PDF from a deployment's communications plan. Condition 1 is the
 * FEMA block-4 table; Conditions 2 and 3 follow as labelled sections. Cells
 * wrap instead of truncating. jsPDF is loaded on demand; works offline.
 *
 * @param {{ deployment: Object, plan: Object, rows: Object[], period?: Object|null }} params
 * @returns {Promise<Blob>}
 */
export async function renderIcs205Pdf({ deployment, plan, rows, period }) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;
  const contentW = pageW - margin * 2;
  let y = margin;

  const text = (s, x, yy, opts = {}) => doc.text(String(s ?? ''), x, yy, opts);
  const ensure = (h) => { if (y + h > pageH - 14) { doc.addPage(); y = margin; } };

  doc.setFont('helvetica', 'bold').setFontSize(13);
  text('INCIDENT RADIO COMMUNICATIONS PLAN (ICS 205)', margin, y + 5);
  doc.setFont('helvetica', 'normal').setFontSize(8);
  text(`Plan v${plan.version || 1} · generated ${formatDateTime(new Date())}`, pageW - margin, y + 5, { align: 'right' });
  y += 9;

  const opStart = period?.starts_at || deployment.starts_at;
  const opEnd = period?.ends_at || deployment.ends_at;
  const boxes = [
    ['1. Incident Name', deployment.name || ''],
    ['2. Date/Time Prepared', formatDateTime(plan.prepared_at || plan.updated_at) || ''],
    ['3. Operational Period', `${formatDateTime(opStart) || '—'}  to  ${formatDateTime(opEnd) || '—'}${period?.label ? `  (${period.label})` : ''}`],
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

  const totalW = CHANNEL_COLUMNS.reduce((s, c) => s + c.width, 0);
  const scale = contentW / totalW;
  const lineH = 3.4;

  const drawHeader = () => {
    let x = margin;
    const rowH = 7;
    doc.setFillColor(230, 230, 230);
    doc.rect(margin, y, contentW, rowH, 'F');
    doc.setFont('helvetica', 'bold').setFontSize(6.8);
    for (const col of CHANNEL_COLUMNS) {
      const w = col.width * scale;
      doc.rect(x, y, w, rowH);
      text(col.label, x + 1, y + 4.5);
      x += w;
    }
    y += rowH;
  };

  const drawRows = (list) => {
    doc.setFont('helvetica', 'normal').setFontSize(7.2);
    for (const row of (list.length ? list : [{}])) {
      const cells = CHANNEL_COLUMNS.map(col => doc.splitTextToSize(String(cellValue(row, col.key)), col.width * scale - 2));
      const rowH = Math.max(6.5, Math.max(...cells.map(c => c.length)) * lineH + 2.5);
      if (y + rowH > pageH - 14) { doc.addPage(); y = margin; drawHeader(); doc.setFont('helvetica', 'normal').setFontSize(7.2); }
      let x = margin;
      CHANNEL_COLUMNS.forEach((col, i) => {
        const w = col.width * scale;
        doc.rect(x, y, w, rowH);
        doc.text(cells[i], x + 1, y + 4, { baseline: 'alphabetic' });
        x += w;
      });
      y += rowH;
    }
  };

  const groups = groupByCondition(rows);
  for (const level of [1, 2, 3]) {
    const list = groups[level] ?? [];
    if (level > 1 && list.length === 0) continue;
    ensure(20);
    doc.setFont('helvetica', 'bold').setFontSize(8);
    const c = CONDITIONS[level];
    text(level === 1 ? `4. Basic Radio Channel Use  —  ${c.label}: ${c.title}` : `4${'abc'[level - 1]}. ${c.label}: ${c.title} (${c.hint})`, margin, y + 3);
    y += 5;
    drawHeader();
    drawRows(list);
    y += 4;
  }

  doc.setFont('helvetica', 'bold').setFontSize(8);
  ensure(24);
  text('5. Special Instructions', margin, y + 3);
  doc.setFont('helvetica', 'normal').setFontSize(8.5);
  const lines = doc.splitTextToSize(plan.special_instructions || '', contentW - 4);
  const boxH = Math.max(16, lines.length * 4 + 6);
  ensure(boxH + 8);
  doc.rect(margin, y + 5, contentW, boxH);
  doc.text(lines, margin + 2, y + 10);
  y += boxH + 8;

  ensure(14);
  doc.rect(margin, y, contentW, 12);
  doc.setFont('helvetica', 'bold').setFontSize(7);
  text('6. Prepared by (Communications Unit)', margin + 1.5, y + 3.5);
  doc.setFont('helvetica', 'normal').setFontSize(9);
  text(`Name: ${plan.prepared_by_name || ''}     Position/Title: ${plan.prepared_by_position || 'COML'}     Date/Time: ${formatDateTime(plan.prepared_at || plan.updated_at) || ''}`, margin + 1.5, y + 9);

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(7).setTextColor(120);
    text(`ICS 205  ·  ${deployment.name}  ·  page ${p} of ${pages}  ·  EmComm Planner`, pageW - margin, pageH - 4, { align: 'right' });
    doc.setTextColor(0);
  }
  return doc.output('blob');
}
