import { formatDateTime } from '@/lib/time';

export const CHANNEL_COLUMNS = [
  { key: 'zone_group', label: 'Zone/Grp', width: 16 },
  { key: 'channel_number', label: 'Ch #', width: 12 },
  { key: 'function', label: 'Function', width: 26 },
  { key: 'channel_name', label: 'Channel Name', width: 32 },
  { key: 'assignment', label: 'Assignment', width: 30 },
  { key: 'rx_freq', label: 'RX Freq', width: 24 },
  { key: 'rx_tone', label: 'RX Tone/NAC', width: 22 },
  { key: 'tx_freq', label: 'TX Freq', width: 24 },
  { key: 'tx_tone', label: 'TX Tone/NAC', width: 22 },
  { key: 'mode', label: 'Mode', width: 12 },
  { key: 'remarks', label: 'Remarks', width: 40 },
];

/**
 * Render an ICS 205 (Incident Radio Communications Plan) as a landscape PDF
 * in the browser. jsPDF is loaded on demand so it only ships to users who
 * export. Works offline.
 *
 * @param {{ form: Object, locationName: string, deploymentName?: string }} params
 * @returns {Promise<Blob>}
 */
export async function renderIcs205Pdf({ form, locationName, deploymentName }) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;
  let y = margin;

  const text = (s, x, yy, opts = {}) => doc.text(String(s ?? ''), x, yy, opts);

  // Header block
  doc.setFont('helvetica', 'bold').setFontSize(13);
  text('INCIDENT RADIO COMMUNICATIONS PLAN (ICS 205)', margin, y + 5);
  doc.setFont('helvetica', 'normal').setFontSize(9);
  text(`Generated ${formatDateTime(new Date())}`, pageW - margin, y + 5, { align: 'right' });
  y += 9;

  const boxes = [
    ['1. Incident Name', form.incident_name || ''],
    ['2. Date/Time Prepared', formatDateTime(form.preparation_date) || ''],
    ['3. Operational Period', `${formatDateTime(form.operational_period_start) || '—'}  to  ${formatDateTime(form.operational_period_end) || '—'}`],
    ['Site', `${locationName || ''}${deploymentName ? `  (${deploymentName})` : ''}`],
  ];
  const boxW = (pageW - margin * 2) / boxes.length;
  boxes.forEach(([label, value], i) => {
    const x = margin + i * boxW;
    doc.rect(x, y, boxW, 12);
    doc.setFontSize(7).setFont('helvetica', 'bold');
    text(label, x + 1.5, y + 3.5);
    doc.setFontSize(9).setFont('helvetica', 'normal');
    text(doc.splitTextToSize(value, boxW - 3)[0] || '', x + 1.5, y + 9);
  });
  y += 15;

  // Channel table
  doc.setFontSize(8).setFont('helvetica', 'bold');
  text('4. Basic Radio Channel Use', margin, y + 3);
  y += 5;
  const totalW = CHANNEL_COLUMNS.reduce((s, c) => s + c.width, 0);
  const scale = (pageW - margin * 2) / totalW;
  const rowH = 7;

  const drawHeader = () => {
    let x = margin;
    doc.setFillColor(230, 230, 230);
    doc.rect(margin, y, pageW - margin * 2, rowH, 'F');
    doc.setFont('helvetica', 'bold').setFontSize(7);
    for (const col of CHANNEL_COLUMNS) {
      const w = col.width * scale;
      doc.rect(x, y, w, rowH);
      text(col.label, x + 1, y + 4.5);
      x += w;
    }
    y += rowH;
  };
  drawHeader();

  doc.setFont('helvetica', 'normal').setFontSize(7.5);
  const channels = form.radio_channels?.length ? form.radio_channels : [{}];
  for (const ch of channels) {
    if (y + rowH > pageH - 30) { doc.addPage(); y = margin; drawHeader(); doc.setFont('helvetica', 'normal').setFontSize(7.5); }
    let x = margin;
    for (const col of CHANNEL_COLUMNS) {
      const w = col.width * scale;
      doc.rect(x, y, w, rowH);
      const value = col.key === 'mode' ? modeLabel(ch.mode) : ch[col.key];
      text(doc.splitTextToSize(String(value ?? ''), w - 2)[0] || '', x + 1, y + 4.5);
      x += w;
    }
    y += rowH;
  }
  y += 4;

  // Special instructions
  doc.setFont('helvetica', 'bold').setFontSize(8);
  text('5. Special Instructions', margin, y + 3);
  doc.setFont('helvetica', 'normal').setFontSize(8.5);
  const lines = doc.splitTextToSize(form.special_instructions || '', pageW - margin * 2 - 4);
  const boxH = Math.max(16, lines.length * 4 + 6);
  if (y + boxH > pageH - 22) { doc.addPage(); y = margin; }
  doc.rect(margin, y + 5, pageW - margin * 2, boxH);
  doc.text(lines, margin + 2, y + 10);
  y += boxH + 8;

  // Footer / prepared by
  if (y + 14 > pageH - margin) { doc.addPage(); y = margin; }
  doc.rect(margin, y, pageW - margin * 2, 12);
  doc.setFont('helvetica', 'bold').setFontSize(7);
  text('6. Prepared by (Communications Unit)', margin + 1.5, y + 3.5);
  doc.setFont('helvetica', 'normal').setFontSize(9);
  text(`Name: ${form.prepared_by_name || ''}     Position/Title: ${form.prepared_by_position || ''}     Date/Time: ${formatDateTime(form.preparation_date) || ''}`, margin + 1.5, y + 9);

  doc.setFontSize(7).setTextColor(120);
  text('ICS 205  ·  Prepared with EmComm Planner', pageW - margin, pageH - 4, { align: 'right' });

  return doc.output('blob');
}

export function modeLabel(mode) {
  return { A: 'Analog', D: 'Digital', M: 'Mixed' }[mode] || mode || '';
}
