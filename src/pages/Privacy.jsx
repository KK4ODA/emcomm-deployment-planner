import React from 'react';
import privacySource from '../../docs/PRIVACY.md?raw';
import { MarkdownDoc } from '@/components/common/MarkdownDoc';

/** The privacy policy (docs/PRIVACY.md), public at /privacy; linked from the Google consent screen. */
export default function Privacy() {
  return <MarkdownDoc source={privacySource} navLabel="Policy sections" />;
}
