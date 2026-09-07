import React from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon, Monitor } from 'lucide-react';
import { DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';

/** Theme options rendered inside the user menu. */
export function ThemeMenuItems() {
  const { theme, setTheme } = useTheme();
  const options = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'Match system', icon: Monitor },
  ];
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>Appearance</DropdownMenuLabel>
      {options.map(({ value, label, icon: Icon }) => (
        <DropdownMenuItem key={value} onClick={() => setTheme(value)} aria-checked={theme === value} role="menuitemradio">
          <Icon /> {label}
          {theme === value && <span className="ml-auto text-xs text-muted-foreground">✓</span>}
        </DropdownMenuItem>
      ))}
    </>
  );
}
