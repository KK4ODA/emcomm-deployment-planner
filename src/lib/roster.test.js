import { describe, it, expect } from 'vitest';
import { parseCsv, parseRoster, rosterSummary } from './roster';

describe('parseCsv', () => {
  it('handles quotes, escaped quotes and CRLF', () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\r\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"']]);
  });
  it('falls back to tabs or semicolons', () => {
    expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('parseRoster', () => {
  const csv = [
    'Email*,Call Sign,First Name,Last Name,Cell,License,Role',
    'alice@example.com,kk4abc,Alice,Smith,404-555-0100,E,operator',
    'BOB@example.com,W4XYZ,Bob,Jones,,tech,',
    'carol@example.com,,Carol,,,,',
    'not-an-email,K4AAA,Dan,,,,',
    'alice@example.com,N4BBB,Alice again,,,,',
    'erin@example.com,KK4ABC,Erin,,,Novice,boss',
    'frank@example.com,ZZZ,Frank,,,,',
  ].join('\n');

  it('maps tolerant headers, normalises values and classifies rows', () => {
    const { rows, missing } = parseRoster(csv, { existingEmails: ['bob@example.com'], existingCallSigns: ['W4XYZ'] });
    expect(missing).toEqual([]);
    expect(rows[0]).toMatchObject({ email: 'alice@example.com', call_sign: 'KK4ABC', full_name: 'Alice Smith', phone: '404-555-0100', license_class: 'extra', role: 'operator', status: 'new' });
    expect(rows[1]).toMatchObject({ email: 'bob@example.com', license_class: 'technician', status: 'existing' });
    expect(rows[2]).toMatchObject({ call_sign: null, full_name: 'Carol', status: 'new' });
    expect(rows[3].status).toBe('invalid');
    expect(rows[3].problems[0]).toMatch(/not an email/);
    expect(rows[4].problems).toContain('Duplicate email in the file');
    expect(rows[5].problems).toEqual(expect.arrayContaining(['Duplicate call sign in the file', 'Role "boss" not recognised']));
    expect(rows[6].problems[0]).toMatch(/not valid/);
    expect(rosterSummary(rows)).toEqual({ total: 7, new: 2, existing: 1, invalid: 4 });
  });

  it('reports a missing email column', () => {
    expect(parseRoster('name,phone\nA,1')).toMatchObject({ rows: [], missing: ['email'] });
  });

  it('flags a call sign already used by a different member', () => {
    const { rows } = parseRoster('email,call\nnew@example.com,KK4ODA', { existingEmails: ['owner@example.com'], existingCallSigns: ['KK4ODA'] });
    expect(rows[0].problems[0]).toMatch(/already belongs/);
  });
});
