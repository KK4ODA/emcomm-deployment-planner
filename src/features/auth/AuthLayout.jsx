import React from 'react';
import { Brand } from '@/components/shell/Brand';
import { APP_NAME } from '@/lib/constants';

/**
 * Split layout for sign-in style pages: photographic panel on wide screens,
 * form card on the right. The image is bundled so it works offline.
 */
/** @param {{ title: React.ReactNode, description?: React.ReactNode, children: React.ReactNode, footer?: React.ReactNode }} props */
export function AuthLayout({ title, description, children, footer }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-sidebar text-white lg:flex lg:flex-col lg:justify-between lg:p-10">
        <img src="/login-bg.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-50" />
        <div className="absolute inset-0 bg-gradient-to-t from-sidebar via-sidebar/70 to-sidebar/30" />
        <div className="relative"><Brand light /></div>
        <div className="relative max-w-md space-y-3">
          <h2 className="text-2xl font-semibold leading-tight">Plan the deployment before the net opens.</h2>
          <p className="text-sm text-white/70">
            Sites, equipment, setup tasks and ICS 205 radio plans for your ARES group, in one place, and still usable when the internet is not.
          </p>
        </div>
        <p className="relative text-xs text-white/50">{APP_NAME}</p>
      </aside>

      <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10">
        <div className="mb-6 lg:hidden"><Brand /></div>
        <div className="w-full max-w-sm">
          <div className="mb-5">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
          <div className="rounded-lg border bg-card p-5 shadow-sm">{children}</div>
          {footer && <div className="mt-4 text-center text-sm text-muted-foreground">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
