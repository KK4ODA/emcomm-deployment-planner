import { formatDateTime } from '@/lib/time';

/**
 * One-page safety checklist record with the signature line.
 * @param {{ deployment: Object, checklist: Object, preparedByName?: string }} params
 */
export async function renderSafetyChecklistPdf({ deployment, checklist, preparedByName = '' }) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentW = pageW - margin * 2;
  let y = margin;
  doc.setFont('helvetica', 'bold').setFontSize(14);
  doc.text('SAFETY CHECKLIST', margin, y + 5);
  doc.setFont('helvetica', 'normal').setFontSize(9);
  doc.text(`${checklist.template_name || ''}`, margin, y + 11);
  doc.text(`Generated ${formatDateTime(new Date())}`, pageW - margin, y + 5, { align: 'right' });
  y += 16;
  doc.setFontSize(10);
  doc.text(`Event: ${deployment.name}${deployment.served_agency ? `  ·  for ${deployment.served_agency}` : ''}`, margin, y);
  y += 5;
  doc.text(`Window: ${formatDateTime(deployment.starts_at) || '—'} to ${formatDateTime(deployment.ends_at) || '—'}`, margin, y);
  y += 8;

  doc.setFontSize(9.5);
  (checklist.items || []).forEach((it, idx) => {
    const mark = it.state === 'ok' ? 'X' : it.state === 'na' ? 'N/A' : '';
    const lines = doc.splitTextToSize(`${idx + 1}. ${it.text}${it.note ? `  (${it.note})` : ''}`, contentW - 16);
    const h = lines.length * 4.4 + 2;
    if (y + h > pageH - 40) { doc.addPage(); y = margin; }
    doc.rect(margin, y - 3.2, 6, 5);
    doc.setFont('helvetica', 'bold').setFontSize(7);
    doc.text(mark, margin + 3, y + 0.4, { align: 'center' });
    doc.setFont('helvetica', 'normal').setFontSize(9.5);
    doc.text(lines, margin + 9, y);
    y += h;
  });

  if (checklist.notes) {
    if (y + 20 > pageH - 40) { doc.addPage(); y = margin; }
    y += 3;
    doc.setFont('helvetica', 'bold').setFontSize(9);
    doc.text('Notes', margin, y);
    doc.setFont('helvetica', 'normal').setFontSize(9);
    const lines = doc.splitTextToSize(checklist.notes, contentW);
    doc.text(lines, margin, y + 5);
    y += lines.length * 4.4 + 8;
  }

  if (y + 26 > pageH - 14) { doc.addPage(); y = margin; }
  y += 4;
  doc.rect(margin, y, contentW, 20);
  doc.setFont('helvetica', 'bold').setFontSize(8);
  doc.text('Safety Officer', margin + 2, y + 5);
  doc.setFont('helvetica', 'normal').setFontSize(10);
  if (checklist.signed_at) {
    doc.text(`${checklist.signed_name || ''}`, margin + 2, y + 12);
    doc.text(`Signed ${formatDateTime(checklist.signed_at)} (recorded electronically in EmComm Planner)`, margin + 2, y + 17);
  } else {
    doc.text('Signature: ______________________________   Date/Time: ____________________', margin + 2, y + 13);
  }
  doc.setFontSize(7).setTextColor(120);
  doc.text(`${deployment.name}  ·  prepared by ${preparedByName || ''}  ·  EmComm Planner`, pageW - margin, pageH - 5, { align: 'right' });
  doc.setTextColor(0);
  return doc.output('blob');
}
