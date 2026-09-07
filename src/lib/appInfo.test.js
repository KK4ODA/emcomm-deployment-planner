import { describe, it, expect } from 'vitest';
import { APP_VERSION, releaseNotesUrl, isPrerelease, REPO_URL } from './appInfo';

describe('appInfo', () => {
  it('exposes the version injected at build time', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('builds the release notes URL from the tag convention', () => {
    expect(releaseNotesUrl('1.2.3')).toBe(`${REPO_URL}/releases/tag/v1.2.3`);
    expect(releaseNotesUrl()).toContain(`/releases/tag/v${APP_VERSION}`);
  });

  it('detects pre-release versions', () => {
    expect(isPrerelease('1.1.0-beta.1')).toBe(true);
    expect(isPrerelease('1.1.0')).toBe(false);
  });
});
