/**
 * Position naming schemes: "AID MILE {n}" with tactical "AID {n}". Saved per
 * group so every event names positions the same way and net control never
 * has to invent a call on the air. Pure helpers.
 */

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Regex that matches names produced by a pattern, capturing the number (or token). */
export function patternToRegex(pattern) {
  const parts = String(pattern).split('{n}');
  return new RegExp('^' + parts.map(escapeRe).join('\\s*([A-Za-z0-9]+)\\s*') + '$', 'i');
}

/** Fill a pattern with a value; append when the pattern has no {n}. */
export function fillPattern(pattern, value) {
  if (!pattern) return '';
  return pattern.includes('{n}') ? pattern.replace(/\{n\}/g, String(value)) : `${pattern} ${value}`.trim();
}

/**
 * The scheme (and captured number) whose position pattern matches a name.
 * @param {string} name
 * @param {Array<{ position_pattern: string }>} schemes
 * @returns {{ scheme: Object, value: string|null }|null}
 */
export function matchScheme(name, schemes) {
  const n = String(name || '').trim();
  if (!n) return null;
  for (const scheme of schemes) {
    if (!scheme.position_pattern) continue;
    const m = patternToRegex(scheme.position_pattern).exec(n);
    if (m) return { scheme, value: m[1] ?? null };
  }
  return null;
}

/** Tactical call suggested by the group's schemes for a position name, or null. */
export function deriveTactical(name, schemes) {
  const hit = matchScheme(name, schemes);
  if (!hit || !hit.scheme.tactical_pattern) return null;
  return fillPattern(hit.scheme.tactical_pattern, hit.value ?? '').toUpperCase().replace(/\s+/g, ' ').trim();
}

/** Defaults a scheme contributes when it matches (type, net, requirements). */
export function schemeDefaults(scheme) {
  if (!scheme) return {};
  const out = {};
  if (scheme.position_type) out.position_type = scheme.position_type;
  if (scheme.net) out.net = scheme.net;
  if (Array.isArray(scheme.requirements) && scheme.requirements.length) out.requirements = scheme.requirements;
  return out;
}

/** A scheme row from what the bulk dialog was just used with. */
export function schemeFromBulk({ pattern, tacticalPattern, type, net, requirements }, groupId, name = null) {
  return {
    ares_group_id: groupId,
    name: name || pattern.replace(/\{n\}/g, '#').trim(),
    position_pattern: pattern.trim(),
    tactical_pattern: tacticalPattern?.trim() ? tacticalPattern.trim().toUpperCase() : null,
    position_type: type || null,
    net: net?.trim() || null,
    requirements: Array.isArray(requirements) ? requirements : [],
  };
}
