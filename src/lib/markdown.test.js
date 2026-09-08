import { describe, it, expect } from 'vitest';
import { parseMarkdown, parseInline, slugify, outline } from './markdown';

describe('markdown reader', () => {
  it('splits headings, paragraphs, lists and rules', () => {
    const blocks = parseMarkdown('# Title\n\nOne line\nsame paragraph.\n\n- a\n- **b**\n  continued\n\n---\n\n## 1. Next\n');
    expect(blocks.map(b => b.type)).toEqual(['heading', 'paragraph', 'list', 'rule', 'heading']);
    expect(blocks[1]).toMatchObject({ text: 'One line same paragraph.' });
    expect(blocks[2]).toMatchObject({ items: ['a', '**b** continued'] });
    expect(blocks[4]).toMatchObject({ level: 2, id: 'next' });
  });

  it('gives duplicate headings distinct ids', () => {
    const ids = parseMarkdown('## Sites\n## Sites\n').map(b => b.type === 'heading' && b.id);
    expect(ids).toEqual(['sites', 'sites-2']);
    expect(slugify('3. Coordinators: building a deployment')).toBe('coordinators-building-a-deployment');
  });

  it('reads inline bold, italic, code and links', () => {
    expect(parseInline('Tap *Got it*, send `@@#checkin` to **net control**, see [guide](/guide).')).toEqual([
      { type: 'text', text: 'Tap ' },
      { type: 'em', text: 'Got it' },
      { type: 'text', text: ', send ' },
      { type: 'code', text: '@@#checkin' },
      { type: 'text', text: ' to ' },
      { type: 'strong', text: 'net control' },
      { type: 'text', text: ', see ' },
      { type: 'link', text: 'guide', href: '/guide' },
      { type: 'text', text: '.' },
    ]);
    expect(parseInline('plain')).toEqual([{ type: 'text', text: 'plain' }]);
  });

  it('builds an outline from second-level headings', () => {
    const blocks = parseMarkdown('# G\n## 1. A\n### skip\n## 2. B\n');
    expect(outline(blocks)).toEqual([{ id: 'a', text: '1. A' }, { id: 'b', text: '2. B' }]);
  });
});
