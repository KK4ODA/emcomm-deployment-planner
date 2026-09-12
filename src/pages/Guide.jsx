import React from 'react';
import guideSource from '../../docs/USER_GUIDE.md?raw';
import { MarkdownDoc } from '@/components/common/MarkdownDoc';

/** The user guide (docs/USER_GUIDE.md), public at /guide. */
export default function Guide() {
  return <MarkdownDoc source={guideSource} navLabel="Guide sections" />;
}
