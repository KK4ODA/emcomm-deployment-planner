import React, { useEffect, useState } from 'react';
import { ALargeSmall } from 'lucide-react';
import { DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { TEXT_SIZES, getTextSize, setTextSize } from '@/lib/textSize';

/** Text size options rendered inside the user menu. */
export function TextSizeMenuItems() {
  const [size, setSize] = useState(getTextSize());
  useEffect(() => {
    const on = (e) => setSize(e.detail);
    window.addEventListener('emcomm:text-size', on);
    return () => window.removeEventListener('emcomm:text-size', on);
  }, []);
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="flex items-center gap-1.5"><ALargeSmall className="h-4 w-4" /> Text size</DropdownMenuLabel>
      {TEXT_SIZES.map(t => (
        <DropdownMenuItem key={t.id} onClick={() => setSize(setTextSize(t.id))} aria-checked={size === t.id} role="menuitemradio">
          <span style={{ fontSize: `${t.px}px` }} className="leading-none">A</span> {t.label}
          {size === t.id && <span className="ml-auto text-xs text-muted-foreground">✓</span>}
        </DropdownMenuItem>
      ))}
    </>
  );
}
