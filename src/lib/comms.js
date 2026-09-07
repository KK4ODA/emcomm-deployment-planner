/**
 * Communications-plan helpers: frequency normalisation, band and offset
 * rules, PACE / condition vocabularies, plan completeness checks and the
 * CHIRP CSV export. Pure functions, unit-tested.
 */

export const CONDITIONS = Object.freeze({
  1: { label: 'Condition 1', title: 'Normal operations', hint: 'Repeaters, internet and phones working' },
  2: { label: 'Condition 2', title: 'Degraded', hint: 'Internet and phones down; repeaters up' },
  3: { label: 'Condition 3', title: 'Repeaters down', hint: 'Simplex with relays; nothing else assumed' },
});

export const PATH_ROLES = Object.freeze({
  primary: { label: 'Primary', short: 'P', tone: 'success' },
  alternate: { label: 'Alternate', short: 'A', tone: 'info' },
  contingency: { label: 'Contingency', short: 'C', tone: 'warning' },
  emergency: { label: 'Emergency', short: 'E', tone: 'critical' },
});

export const CHANNEL_FUNCTIONS = Object.freeze(['Command', 'Tactical', 'Support', 'Data', 'Phone', 'Logistics', 'Medical']);

export const CHANNEL_CONFIGS = Object.freeze({
  repeater: 'Repeater',
  simplex: 'Simplex',
  digital: 'Digital / gateway',
  talkgroup: 'Talkgroup',
  phone: 'Phone number',
  other: 'Other',
});

export const DIGITAL_MODES = Object.freeze(['vara_fm', 'vara_hf', 'packet', 'ardop', 'aprs', 'dstar', 'dmr', 'fusion', 'mesh', 'echolink']);

/** "146.76" | "146,760" | 146.76 → "146.7600"; empty/invalid → "". */
export function normalizeFrequency(input) {
  if (input === null || input === undefined) return '';
  const s = String(input).trim().replace(',', '.').replace(/[^\d.]/g, '');
  if (!s) return '';
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return '';
  return n.toFixed(4);
}

/** Amateur band name for a frequency in MHz, or '' when outside common bands. */
export function bandOf(mhz) {
  const f = Number(mhz);
  if (!Number.isFinite(f)) return '';
  if (f >= 1.8 && f <= 29.7) return 'HF';
  if (f >= 50 && f <= 54) return '6m';
  if (f >= 144 && f <= 148) return '2m';
  if (f >= 222 && f <= 225) return '1.25m';
  if (f >= 420 && f <= 450) return '70cm';
  if (f >= 462 && f <= 467.8) return 'GMRS';
  if (f >= 902 && f <= 928) return '33cm';
  if (f >= 1240 && f <= 1300) return '23cm';
  return '';
}

/**
 * Standard US repeater offset for a receive frequency (MHz). Returns the
 * transmit frequency, or the same frequency when no offset convention applies.
 */
export function suggestTx(rxMhz) {
  const f = Number(rxMhz);
  if (!Number.isFinite(f)) return null;
  const r = (v) => Number(v.toFixed(4));
  if (f >= 145.1 && f < 145.5) return r(f - 0.6);
  if (f >= 146.0 && f < 146.4) return r(f + 0.6);
  if (f >= 146.6 && f < 147.0) return r(f - 0.6);
  if (f >= 147.0 && f < 147.4) return r(f + 0.6);
  if (f >= 147.6 && f < 148.0) return r(f - 0.6);
  if (f >= 223.0 && f < 225.0) return r(f - 1.6);
  if (f >= 440.0 && f < 445.0) return r(f + 5.0);
  if (f >= 447.0 && f < 450.0) return r(f - 5.0);
  return r(f);
}

/** '−' / '+' / '' (simplex) for a channel, or '±x.xxx' for a non-standard split. */
export function offsetLabel(rx, tx) {
  const a = Number(rx), b = Number(tx);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return '';
  const diff = Number((b - a).toFixed(4));
  if (Math.abs(Math.abs(diff) - 0.6) < 0.0001 || Math.abs(Math.abs(diff) - 5) < 0.0001 || Math.abs(Math.abs(diff) - 1.6) < 0.0001) return diff > 0 ? '+' : '−';
  return `${diff > 0 ? '+' : '−'}${Math.abs(diff).toFixed(3)}`;
}

/** Warn (do not block) when a frequency is outside the common amateur bands. */
export function frequencyWarning(mhz) {
  if (mhz === '' || mhz == null) return '';
  return bandOf(mhz) ? '' : 'Outside the usual amateur / GMRS bands. Check the value.';
}

/**
 * One-line summary a human can program a radio from:
 *   "146.8200− PL 146.2"  ·  "146.5500 simplex"  ·  "VARA FM 145.7700 → WD5EMA-10"  ·  "404-612-5650"
 */
export function channelSummary(ch) {
  if (!ch) return '';
  if (ch.config === 'phone' || (ch.phone_number && !ch.rx_freq)) return ch.phone_number || '';
  const rx = ch.rx_freq != null && ch.rx_freq !== '' ? Number(ch.rx_freq).toFixed(4) : '';
  const off = offsetLabel(ch.rx_freq, ch.tx_freq);
  const tone = ch.tx_tone || ch.rx_tone;
  const parts = [];
  if (ch.mode === 'D' && ch.digital_mode) parts.push(digitalModeLabel(ch.digital_mode));
  if (rx) parts.push(`${rx}${off}`);
  if (!off && rx && ch.config === 'simplex') parts.push('simplex');
  if (tone) parts.push(/^\d/.test(String(tone)) ? `PL ${tone}` : String(tone));
  if (ch.gateway_callsign) parts.push(`→ ${ch.gateway_callsign}`);
  if (ch.tactical_address) parts.push(`(${ch.tactical_address})`);
  return parts.join(' ');
}

export function digitalModeLabel(id) {
  const map = { vara_fm: 'VARA FM', vara_hf: 'VARA HF', packet: 'Packet', ardop: 'ARDOP', aprs: 'APRS', dstar: 'D-STAR', dmr: 'DMR', fusion: 'Fusion', mesh: 'AREDN', echolink: 'EchoLink' };
  return map[id] || id || '';
}

/** Copy the library fields into a plan row (snapshot). */
export function snapshotFromChannel(channel) {
  return {
    channel_id: channel.id,
    channel_name: channel.name,
    band: channel.band ?? null,
    config: channel.config ?? null,
    rx_freq: channel.rx_freq ?? null,
    rx_tone: channel.rx_tone ?? null,
    rx_bandwidth: channel.rx_bandwidth ?? null,
    tx_freq: channel.tx_freq ?? null,
    tx_tone: channel.tx_tone ?? null,
    tx_bandwidth: channel.tx_bandwidth ?? null,
    mode: channel.mode ?? 'A',
    digital_mode: channel.digital_mode ?? null,
    gateway_callsign: channel.gateway_callsign ?? null,
    tactical_address: channel.tactical_address ?? null,
    owner_callsign: channel.owner_callsign ?? null,
    phone_number: channel.phone_number ?? null,
    timeout_seconds: channel.timeout_seconds ?? null,
  };
}

/** True when the plan row's snapshot differs from the current library row. */
export function snapshotStale(row, channel) {
  if (!channel) return false;
  const snap = snapshotFromChannel(channel);
  return Object.keys(snap).some(k => k !== 'channel_id' && String(snap[k] ?? '') !== String(row[k] ?? ''));
}

/** Rows grouped by condition level, sorted by PACE role then sort order. */
export function groupByCondition(rows) {
  const order = { primary: 0, alternate: 1, contingency: 2, emergency: 3 };
  const groups = { 1: [], 2: [], 3: [] };
  for (const r of rows) (groups[r.condition_level] ??= []).push(r);
  for (const k of Object.keys(groups)) {
    groups[k].sort((a, b) => (order[a.path_role] ?? 9) - (order[b.path_role] ?? 9) || (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }
  return groups;
}

/** Channels that apply to a position: matching net, or unassigned-to-a-net rows. */
export function channelsForNet(rows, net) {
  if (!net) return rows;
  const wanted = net.trim().toLowerCase();
  const matched = rows.filter(r => (r.net || '').trim().toLowerCase() === wanted);
  const general = rows.filter(r => !r.net);
  return [...matched, ...general];
}

/**
 * Human-readable gaps in a plan. Returns [] when the plan looks complete.
 * @param {Object[]} rows comms_plan_channels
 */
export function planWarnings(rows) {
  const w = [];
  const c1 = rows.filter(r => r.condition_level === 1);
  if (!rows.length) return ['No channels yet. Add the primary net from the library.'];
  if (!c1.some(r => r.path_role === 'primary')) w.push('Condition 1 has no primary channel.');
  if (!c1.some(r => r.path_role === 'alternate')) w.push('Condition 1 has no alternate (backup repeater).');
  if (!rows.some(r => r.condition_level === 3)) w.push('No Condition 3 (repeaters down) simplex path is defined.');
  const missingTx = rows.filter(r => r.config !== 'phone' && r.mode !== 'D' && r.rx_freq && !r.tx_freq);
  if (missingTx.length) w.push(`${missingTx.length} channel${missingTx.length === 1 ? '' : 's'} without a transmit frequency.`);
  const noFunction = rows.filter(r => !r.function);
  if (noFunction.length) w.push(`${noFunction.length} channel${noFunction.length === 1 ? '' : 's'} without a function (Command / Tactical / …).`);
  return w;
}

/** CSV cell escaping. */
function csv(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CHIRP-compatible CSV (generic import format). Analog FM channels only;
 * digital and phone rows are skipped. Names are trimmed to 7 characters.
 * @param {Object[]} rows plan rows in display order
 */
export function toChirpCsv(rows) {
  const header = ['Location', 'Name', 'Frequency', 'Duplex', 'Offset', 'Tone', 'rToneFreq', 'cToneFreq', 'DtcsCode', 'DtcsPolarity', 'Mode', 'TStep', 'Skip', 'Comment', 'URCALL', 'RPT1CALL', 'RPT2CALL', 'DVCODE'];
  const lines = [header.join(',')];
  let i = 0;
  for (const r of rows) {
    if (r.mode === 'D' || r.config === 'phone' || !r.rx_freq) continue;
    const rx = Number(r.rx_freq), tx = r.tx_freq != null && r.tx_freq !== '' ? Number(r.tx_freq) : rx;
    const diff = Number((tx - rx).toFixed(4));
    const duplex = diff === 0 ? '' : diff > 0 ? '+' : '-';
    const tone = String(r.tx_tone || '').trim();
    const isTone = /^\d+(\.\d+)?$/.test(tone);
    const isDtcs = /^D?\d{3}[NR]?$/i.test(tone) && !isTone;
    const name = (r.channel_number ? `${r.channel_name}` : r.channel_name).replace(/[^A-Za-z0-9 \-]/g, '').slice(0, 7).trim();
    lines.push([
      i, name, rx.toFixed(6), duplex, Math.abs(diff).toFixed(6),
      isTone ? 'Tone' : isDtcs ? 'DTCS' : '',
      isTone ? Number(tone).toFixed(1) : '88.5',
      isTone ? Number(tone).toFixed(1) : '88.5',
      isDtcs ? tone.replace(/\D/g, '') : '023',
      'NN',
      r.rx_bandwidth === 'N' ? 'NFM' : 'FM',
      '5.00', '',
      [r.function, r.assignment, r.remarks].filter(Boolean).join(' - '),
      '', '', '', '',
    ].map(csv).join(','));
    i += 1;
  }
  return `${lines.join('\n')}\n`;
}
