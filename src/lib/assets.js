/**
 * Shared asset registry with custody (design doc 9.13). Pure helpers; the
 * server RPC `move_asset` owns the state machine.
 */

export const ASSET_KINDS = Object.freeze({
  radio: 'Radio', antenna: 'Antenna', mast: 'Mast / tripod', power: 'Power', cable: 'Cable / adapter',
  computer: 'Computer / tablet', digital: 'Digital (TNC, modem)', shelter: 'Shelter / table / canopy', other: 'Other',
});

export const ASSET_STATUS = Object.freeze({
  storage: { label: 'In storage', tone: 'success' },
  with_person: { label: 'With a person', tone: 'info' },
  on_site: { label: 'On site', tone: 'warning' },
  retired: { label: 'Retired', tone: 'muted' },
});

/** What the signed-in user may do with an asset right now. */
export function assetActions(asset, user, isPlanner) {
  const out = [];
  if (!asset || !user) return out;
  if (asset.status === 'retired') { if (isPlanner) out.push({ action: 'restored', label: 'Back in service' }); return out; }
  const mine = asset.custodian_user_id === user.id;
  if (asset.status === 'storage') out.push({ action: 'checked_out', label: 'I have it', primary: true });
  if (asset.status === 'with_person' && !mine) out.push({ action: 'checked_out', label: 'I have it now' });
  if (asset.status !== 'storage') out.push({ action: 'returned', label: 'Returned to storage', primary: mine });
  if (asset.status !== 'storage' || isPlanner) out.push({ action: 'on_site', label: 'On site at…' });
  if (isPlanner || mine) out.push({ action: 'transferred', label: 'Hand to…' });
  if (isPlanner) out.push({ action: 'retired', label: 'Retire' });
  return out;
}

/**
 * Assets tied to a deployment that are still out: the teardown checklist.
 * @param {Object[]} assets
 * @param {string} deploymentId
 */
export function outstandingAssets(assets, deploymentId) {
  return assets.filter(a => a.deployment_id === deploymentId && a.status !== 'storage' && a.status !== 'retired');
}

/** Counts for the page header. */
export function assetSummary(assets) {
  const s = { total: 0, storage: 0, with_person: 0, on_site: 0, retired: 0 };
  for (const a of assets) { s.total += 1; if (a.status in s) s[a.status] += 1; }
  return s;
}

/** Who holds it, in words. */
export function custodyLine(asset, usersById, deploymentName = null, siteName = null) {
  const who = asset.custodian_user_id ? usersById.get(asset.custodian_user_id) : null;
  const person = who ? (who.call_sign || who.full_name || who.email) : null;
  switch (asset.status) {
    case 'storage': return asset.home_location ? `In storage: ${asset.home_location}` : 'In storage';
    case 'with_person': return `With ${person || 'someone'}${deploymentName ? ` for ${deploymentName}` : ''}`;
    case 'on_site': return `On site${siteName ? ` at ${siteName}` : ''}${deploymentName ? ` (${deploymentName})` : ''}${person ? `, ${person} responsible` : ''}`;
    case 'retired': return 'Retired';
    default: return asset.status;
  }
}

/** CSV of the registry for the logistics coordinator's clipboard. */
export function assetsCsv(assets, usersById, deploymentName = new Map()) {
  const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [['Name', 'Kind', 'Serial', 'Owner', 'Home', 'Status', 'Custodian', 'Deployment', 'Notes'].join(',')];
  for (const a of assets) {
    const owner = a.owner_user_id ? usersById.get(a.owner_user_id) : null;
    const cust = a.custodian_user_id ? usersById.get(a.custodian_user_id) : null;
    lines.push([a.name, ASSET_KINDS[a.kind] || a.kind, a.serial, owner ? (owner.call_sign || owner.full_name) : 'Group', a.home_location, ASSET_STATUS[a.status]?.label || a.status, cust ? (cust.call_sign || cust.full_name) : '', a.deployment_id ? deploymentName.get(a.deployment_id) || '' : '', a.notes].map(esc).join(','));
  }
  return lines.join('\n');
}
