import { formatDateTime } from '@/lib/time';
import { cardHeading } from '@/lib/icsCards';

/**
 * ICS 219 resource status cards, six to a letter page, cut lines included.
 * The real cards are 8 by 5 inches in a rack; printed six-up they still hold
 * everything a check-in desk needs and fit a clipboard.
 */
const COLS = 2;
const ROWS = 3;

const time = (v) => (v ? formatDateTime(v, 'MM/dd HH:mm') : '');

/**
 * @param {{ deployment: Object, period?: Object|null, cards: Object[], kind: 'personnel'|'crew' }} params
 * @returns {Promise<Blob>}
 */
export async function renderIcs219Pdf({ deployment, period = null, cards, kind }) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;
  const headH = 10;
  const cardW = (pageW - margin * 2) / COLS;
  const cardH = (pageH - margin * 2 - headH) / ROWS;
  const title = kind === 'crew' ? 'CREW / TEAM CARD (ICS 219-2)' : 'PERSONNEL CARD (ICS 219-5)';

  const pageHeader = () => {
    doc.setFont('helvetica', 'bold').setFontSize(11);
    doc.text(title, margin, margin + 4);
    doc.setFont('helvetica', 'normal').setFontSize(8);
    doc.text(cardHeading(deployment, period), margin, margin + 8.5);
    doc.text(`Generated ${formatDateTime(new Date())}`, pageW - margin, margin + 4, { align: 'right' });
  };

  const field = (label, value, x, y, w) => {
    doc.setFontSize(6).setTextColor(110).setFont('helvetica', 'normal');
    doc.text(label.toUpperCase(), x, y);
    doc.setFontSize(9).setTextColor(0);
    const lines = doc.splitTextToSize(String(value ?? '') || '—', w);
    doc.text(lines.slice(0, 2), x, y + 3.6);
    return y + 3.6 + lines.slice(0, 2).length * 3.4;
  };

  const drawCard = (card, col, row) => {
    const x = margin + col * cardW;
    const y = margin + headH + row * cardH;
    doc.setDrawColor(150).setLineWidth(0.2).rect(x + 1, y + 1, cardW - 2, cardH - 2);
    // A band at the top carries the colour convention: grey for personnel,
    // green for a crew, so a rack of printed cards still reads at a glance.
    const band = kind === 'crew' ? [219, 237, 219] : [232, 232, 232];
    doc.setFillColor(band[0], band[1], band[2]);
    doc.rect(x + 1, y + 1, cardW - 2, 8, 'F');
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(0);
    doc.text(kind === 'crew' ? card.unit : `${card.callSign}`, x + 3, y + 6.8);
    doc.setFont('helvetica', 'normal').setFontSize(7.5);
    doc.text(kind === 'crew' ? `${card.headcount} of ${card.needed} pers${card.short ? '  SHORT' : ''}` : card.name, x + cardW - 4, y + 6.8, { align: 'right' });

    const inner = x + 3;
    const w = cardW - 8;
    const half = w / 2 - 2;
    let cy = y + 14;
    if (kind === 'crew') {
      field('Leader', card.leader, inner, cy, half);
      field('Agency', card.agency, inner + half + 4, cy, half);
      cy += 8;
      const names = card.crew.map(c => `${c.callSign}${c.confirmed ? '' : ' (offered)'}${c.phone ? ` ${c.phone}` : ''}`).join(', ');
      cy = field('Crew', names, inner, cy, w) + 1.5;
      field('Departure point', card.departurePoint, inner, cy, half);
      field('Site / division', card.site, inner + half + 4, cy, half);
      cy += 8;
      field('ETD', time(card.etd), inner, cy, half / 2);
      field('Release', time(card.release), inner + half / 2, cy, half / 2);
      field('Net', card.net, inner + half + 4, cy, half);
      cy += 8;
      field('Winlink', card.winlink, inner, cy, w);
    } else {
      field('Name', card.name, inner, cy, half);
      field('Licence', card.licence, inner + half + 4, cy, half);
      cy += 8;
      field('Agency', card.agency, inner, cy, half);
      field('Phone', card.phone, inner + half + 4, cy, half);
      cy += 8;
      field('Unit / tactical', card.unit, inner, cy, half);
      field('Site', card.site, inner + half + 4, cy, half);
      cy += 8;
      field('Departure point', card.departurePoint, inner, cy, half);
      field('Transport', card.transport, inner + half + 4, cy, half);
      cy += 8;
      field('ETD', time(card.etd), inner, cy, half / 2);
      field('Release', time(card.release), inner + half / 2, cy, half / 2);
      field('Status', card.status.replace('_', ' '), inner + half + 4, cy, half);
    }
    doc.setFontSize(6).setTextColor(130);
    doc.text('Check in ____:____   Check out ____:____', inner, y + cardH - 4);
    doc.setTextColor(0);
  };

  if (!cards.length) {
    pageHeader();
    doc.setFontSize(10).text('No assigned operators yet.', margin, margin + headH + 10);
    return doc.output('blob');
  }
  cards.forEach((card, i) => {
    const slot = i % (COLS * ROWS);
    if (i > 0 && slot === 0) doc.addPage();
    if (slot === 0) pageHeader();
    drawCard(card, slot % COLS, Math.floor(slot / COLS));
  });
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(7).setTextColor(120);
    doc.text(`${kind === 'crew' ? 'ICS 219-2' : 'ICS 219-5'}  ·  ${deployment.name}  ·  page ${p} of ${pages}  ·  EmComm Planner`, pageW - margin, pageH - 4, { align: 'right' });
    doc.setTextColor(0);
  }
  return doc.output('blob');
}
