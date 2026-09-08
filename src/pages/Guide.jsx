import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import guideSource from '../../docs/USER_GUIDE.md?raw';
import { Brand } from '@/components/shell/Brand';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/app/routes';
import { parseMarkdown, parseInline, outline } from '@/lib/markdown';

const APP_VERSION = import.meta.env.VITE_APP_VERSION || 'dev';

/**
 * The user guide, rendered from docs/USER_GUIDE.md at build time so it always
 * matches the release. Public: testers can read it before they have an
 * account, and it prints cleanly.
 */
export default function Guide() {
  const blocks = useMemo(() => parseMarkdown(guideSource), []);
  const toc = useMemo(() => outline(blocks), [blocks]);

  return (
    <div className="min-h-dvh bg-background">
      <header className="no-print sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Brand />
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => window.print()} className="hidden sm:inline-flex"><Printer /> Print</Button>
            <Button asChild size="sm" variant="outline"><Link to={ROUTES.dashboard}><ArrowLeft /> Open the app</Link></Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-10 px-4 py-8 lg:grid-cols-[13rem_1fr]">
        <nav aria-label="Guide sections" className="no-print lg:sticky lg:top-20 lg:self-start">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sections</p>
          <ol className="space-y-1 text-sm">
            {toc.map(h => <li key={h.id}><a href={`#${h.id}`} className="text-muted-foreground hover:text-foreground hover:underline">{h.text}</a></li>)}
          </ol>
          <p className="mt-4 text-xs text-muted-foreground">Version {APP_VERSION}</p>
        </nav>

        <article className="min-w-0 max-w-prose">
          {blocks.map((b, i) => <Block key={i} block={b} />)}
        </article>
      </div>
    </div>
  );
}

/** @param {{ block: import('@/lib/markdown').MarkdownBlock }} props */
function Block({ block }) {
  switch (block.type) {
    case 'heading': {
      const cls = { 1: 'text-3xl font-bold tracking-tight', 2: 'mt-10 scroll-mt-20 text-2xl font-semibold tracking-tight', 3: 'mt-6 text-lg font-semibold' }[block.level] || 'mt-4 font-semibold';
      const Tag = /** @type {any} */ (`h${Math.min(block.level, 6)}`);
      return <Tag id={block.id} className={cls}><Inline text={block.text} /></Tag>;
    }
    case 'paragraph':
      return <p className="mt-3 text-sm leading-relaxed sm:text-base"><Inline text={block.text} /></p>;
    case 'list':
      return <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed sm:text-base">{block.items.map((it, i) => <li key={i}><Inline text={it} /></li>)}</ul>;
    case 'rule':
      return <hr className="my-8 border-border" />;
    default:
      return null;
  }
}

/** @param {{ text: string }} props */
function Inline({ text }) {
  return (
    <>
      {parseInline(text).map((t, i) => {
        switch (t.type) {
          case 'strong': return <strong key={i} className="font-semibold text-foreground">{t.text}</strong>;
          case 'em': return <em key={i}>{t.text}</em>;
          case 'code': return <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{t.text}</code>;
          case 'link': return t.href.startsWith('/')
            ? <Link key={i} to={t.href} className="underline underline-offset-4">{t.text}</Link>
            : <a key={i} href={t.href} target="_blank" rel="noreferrer" className="underline underline-offset-4">{t.text}</a>;
          default: return <React.Fragment key={i}>{t.text}</React.Fragment>;
        }
      })}
    </>
  );
}
