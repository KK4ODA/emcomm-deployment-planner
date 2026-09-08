/**
 * Static facts about this build, shared by the About panel, the updater and
 * the shell footer. The version comes from package.json through Vite's
 * `define` (see vite.config.js), so there is a single source of truth.
 */

export const APP_VERSION = import.meta.env.VITE_APP_VERSION || '0.0.0';

export const REPO_URL = 'https://github.com/KK4ODA/emcomm-deployment-planner';
export const RELEASES_URL = `${REPO_URL}/releases`;
export const LATEST_RELEASE_URL = `${REPO_URL}/releases/latest`;
export const ISSUES_URL = `${REPO_URL}/issues`;
export const CHANGELOG_URL = `${REPO_URL}/blob/main/CHANGELOG.md`;
export const DOCS_URL = `${REPO_URL}/tree/main/docs`;
/** The user guide as published with the web app (docs/USER_GUIDE.md). */
export const GUIDE_URL = 'https://emcommplanner.org/guide';

export const PUBLISHER = 'KK4ODA';
export const COPYRIGHT = `© ${new Date().getFullYear()} ${PUBLISHER}`;

/** Update channel; only `stable` exists today (see docs/release.md). */
export const UPDATE_CHANNEL = 'stable';

/** Release notes page for a given version tag. */
export function releaseNotesUrl(version = APP_VERSION) {
  return `${REPO_URL}/releases/tag/v${version}`;
}

/** True for pre-release builds such as 1.1.0-beta.1. */
export function isPrerelease(version = APP_VERSION) {
  return version.includes('-');
}
