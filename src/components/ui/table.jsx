import * as React from 'react';
import { cn } from '@/lib/utils';

export const Table = React.forwardRef(
  /** @type {React.ForwardRefRenderFunction<HTMLTableElement, React.ComponentPropsWithoutRef<'table'>>} */
  (({ className, ...props }, ref) => (
    <div className="relative w-full overflow-x-auto">
      <table ref={ref} className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  )),
);
Table.displayName = 'Table';

export const TableHeader = React.forwardRef(
  /** @type {React.ForwardRefRenderFunction<HTMLTableSectionElement, React.ComponentPropsWithoutRef<'thead'>>} */
  (({ className, ...props }, ref) => <thead ref={ref} className={cn('[&_tr]:border-b', className)} {...props} />),
);
TableHeader.displayName = 'TableHeader';

export const TableBody = React.forwardRef(
  /** @type {React.ForwardRefRenderFunction<HTMLTableSectionElement, React.ComponentPropsWithoutRef<'tbody'>>} */
  (({ className, ...props }, ref) => <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />),
);
TableBody.displayName = 'TableBody';

export const TableRow = React.forwardRef(
  /** @type {React.ForwardRefRenderFunction<HTMLTableRowElement, React.ComponentPropsWithoutRef<'tr'>>} */
  (({ className, ...props }, ref) => (
    <tr ref={ref} className={cn('border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted', className)} {...props} />
  )),
);
TableRow.displayName = 'TableRow';

export const TableHead = React.forwardRef(
  /** @type {React.ForwardRefRenderFunction<HTMLTableCellElement, React.ComponentPropsWithoutRef<'th'>>} */
  (({ className, ...props }, ref) => (
    <th ref={ref} className={cn('h-9 px-3 text-left align-middle text-xs font-semibold uppercase tracking-wide text-muted-foreground', className)} {...props} />
  )),
);
TableHead.displayName = 'TableHead';

export const TableCell = React.forwardRef(
  /** @type {React.ForwardRefRenderFunction<HTMLTableCellElement, React.ComponentPropsWithoutRef<'td'>>} */
  (({ className, ...props }, ref) => <td ref={ref} className={cn('px-3 py-2 align-middle', className)} {...props} />),
);
TableCell.displayName = 'TableCell';
