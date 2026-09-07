export const APP_NAME = 'EmComm Planner';

export const DEPLOYMENT_STATUS = Object.freeze({
  planning: { label: 'Planning', tone: 'info' },
  active: { label: 'Active', tone: 'success' },
  completed: { label: 'Completed', tone: 'neutral' },
  archived: { label: 'Archived', tone: 'muted' },
});

export const TASK_STATUS = Object.freeze({
  pending: { label: 'Pending', tone: 'neutral', rank: 1 },
  in_progress: { label: 'In progress', tone: 'info', rank: 2 },
  completed: { label: 'Completed', tone: 'success', rank: 3 },
});

/** Forward-only transition used by the "advance" buttons. */
export const NEXT_TASK_STATUS = Object.freeze({
  pending: 'in_progress',
  in_progress: 'completed',
  completed: null,
});

export const TASK_PRIORITY = Object.freeze({
  high: { label: 'High', tone: 'critical', rank: 0 },
  medium: { label: 'Medium', tone: 'warning', rank: 1 },
  low: { label: 'Low', tone: 'neutral', rank: 2 },
});

export const ITEM_PRIORITY = Object.freeze({
  essential: { label: 'Essential', tone: 'critical', rank: 0 },
  important: { label: 'Important', tone: 'warning', rank: 1 },
  optional: { label: 'Optional', tone: 'neutral', rank: 2 },
});

/** Category colour names stored in the database → CSS colour. */
export const CATEGORY_COLORS = Object.freeze({
  amber: '#f59e0b',
  emerald: '#10b981',
  sky: '#0ea5e9',
  rose: '#f43f5e',
  violet: '#8b5cf6',
  orange: '#f97316',
  indigo: '#6366f1',
  teal: '#14b8a6',
  pink: '#ec4899',
  slate: '#64748b',
});

export function categoryColor(name) {
  return CATEGORY_COLORS[name] || CATEGORY_COLORS.slate;
}

export const STORAGE_KEYS = Object.freeze({
  currentDeploymentId: 'currentDeploymentId',
  currentLocationId: 'currentLocationId',
  cookieConsent: 'cookieConsent',
  sidebarCollapsed: 'emcomm_sidebar_collapsed',
});

/** Personal go-kit checklist appended to deployment exports. */
export const GO_KIT_ITEMS = Object.freeze([
  'Battery pack for phone', 'Cables for digital interface', 'Charger for HTs',
  'Coax', 'Coax adapters', 'Digirig/AIOC/Signalink', 'First aid kit',
  'High Vis vest', 'HT earpiece', 'HT speakermic', 'Laptop charger with car adapter',
  'Laptop with Ham software', 'Lightweight mast', 'Main HT transceiver',
  'Multitool', 'Paper/Pen', 'Portable VHF/UHF antenna', 'Rain jacket/pants',
  'Spare HT batteries', 'Spare HT transceiver', 'Sturdy shoes', 'Sun hat',
  'Sunscreen', 'Toilet paper', 'Warm clothes', 'Water, snacks, medicines',
]);
