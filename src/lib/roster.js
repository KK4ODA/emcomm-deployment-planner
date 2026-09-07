/**
 * Roster CSV import: the served agency or the old spreadsheet hands over a
 * list of people; we turn it into invitations. Tolerant header matching,
 * validation per row, and a dry-run preview before anything is sent.
 */
import { isValidEmail, normalizeCallsign, isValidCallsign } from './callsign';

const HEADERS = {
  email: ['email', 'e-mail', 'email address', 'mail'],
  call_sign: ['call sign', 'callsign', 'call_sign', 'call', 'amateur call sign'],
  full_name: ['name', 'full name', 'full_name', 'operator', 'member'],
  first_name: ['first name', 'first', 'given name', 'firstname'],
  last_name: ['last name', 'last', 'surname', 'family name', 'lastname'],
  phone: ['phone', 'cell', 'mobile', 'telephone', 'phone number', 'cell phone'],
  license_class: ['license', 'licence', 'class', 'license class', 'licence class', 'lic class'],
  role: ['role', 'app role'],
};
const LICENSE = { n: 'novice', novice: 'novice', t: 'technician', tech: 'technician', technician: 'technician', g: 'general', general: 'general', a: 'advanced', advanced: 'advanced', e: 'extra', extra: 'extra', 'amateur extra': 'extra', ae: 'extra' };
const ROLES = ['pending', 'viewer', 'operator', 'planner', 'admin'];

/** RFC-4180-ish CSV parser: quotes, escaped quotes, CRLF, tabs or semicolons as a fallback delimiter. */
export function parseCsv(text) {
  const src = String(text).replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] || '';
  const counts = [',', '\t', ';'].map(d => ({ d, n: (firstLine.match(new RegExp(`\\${d}`, 'g')) || []).length }));
  const delimiter = counts.sort((a, b) => b.n - a.n)[0].d;
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim() !== ''));
}

function mapHeaders(header) {
  const map = {};
  header.forEach((h, i) => {
    const key = h.trim().toLowerCase().replace(/[*:]/g, '').trim();
    for (const [field, names] of Object.entries(HEADERS)) if (names.includes(key) && map[field] == null) map[field] = i;
  });
  return map;
}

/**
 * @param {string} text CSV content
 * @param {{ existingEmails?: Iterable<string>, existingCallSigns?: Iterable<string> }} [ctx]
 * @returns {{ rows: Array<{ line: number, email: string, call_sign: string|null, full_name: string|null, phone: string|null, license_class: string|null, role: string|null, status: 'new'|'existing'|'invalid', problems: string[] }>, columns: string[], missing: string[] }}
 */
export function parseRoster(text, { existingEmails = [], existingCallSigns = [] } = {}) {
  const table = parseCsv(text);
  if (!table.length) return { rows: [], columns: [], missing: ['email'] };
  const map = mapHeaders(table[0]);
  const columns = Object.keys(map);
  if (map.email == null) return { rows: [], columns, missing: ['email'] };
  const known = new Set([...existingEmails].map(e => String(e).toLowerCase()));
  const knownCalls = new Set([...existingCallSigns].map(c => normalizeCallsign(String(c))));
  const seenEmails = new Set(), seenCalls = new Set();
  const get = (r, f) => (map[f] != null ? String(r[map[f]] ?? '').trim() : '');
  const rows = table.slice(1).map((r, idx) => {
    const problems = [];
    const email = get(r, 'email').toLowerCase();
    if (!email) problems.push('No email');
    else if (!isValidEmail(email)) problems.push(`"${email}" is not an email address`);
    else if (seenEmails.has(email)) problems.push('Duplicate email in the file');
    seenEmails.add(email);
    let call = get(r, 'call_sign');
    if (call) {
      call = normalizeCallsign(call);
      if (!isValidCallsign(call)) problems.push(`Call sign "${call}" is not valid`);
      else if (seenCalls.has(call)) problems.push('Duplicate call sign in the file');
      else if (knownCalls.has(call) && !known.has(email)) problems.push(`Call sign ${call} already belongs to another member`);
      seenCalls.add(call);
    }
    let name = get(r, 'full_name');
    if (!name) name = [get(r, 'first_name'), get(r, 'last_name')].filter(Boolean).join(' ');
    const lcRaw = get(r, 'license_class').toLowerCase();
    const license = lcRaw ? LICENSE[lcRaw] ?? null : null;
    if (lcRaw && !license) problems.push(`Licence class "${get(r, 'license_class')}" not recognised (T, G, E, novice, advanced)`);
    const roleRaw = get(r, 'role').toLowerCase();
    const role = roleRaw ? (ROLES.includes(roleRaw) ? roleRaw : null) : null;
    if (roleRaw && !role) problems.push(`Role "${get(r, 'role')}" not recognised`);
    const status = /** @type {'new'|'existing'|'invalid'} */ (problems.length ? 'invalid' : known.has(email) ? 'existing' : 'new');
    return { line: idx + 2, email, call_sign: call || null, full_name: name || null, phone: get(r, 'phone') || null, license_class: license, role, status, problems };
  });
  return { rows, columns, missing: [] };
}

/** Counts for the preview header. */
export function rosterSummary(rows) {
  return { total: rows.length, new: rows.filter(r => r.status === 'new').length, existing: rows.filter(r => r.status === 'existing').length, invalid: rows.filter(r => r.status === 'invalid').length };
}

/** A starter file people can fill in. */
export const ROSTER_TEMPLATE = 'email,call sign,name,phone,license class\noperator@example.com,KK4ODA,Facundo Example,404-555-0100,Extra\n';
