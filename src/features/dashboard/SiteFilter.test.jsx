import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SiteFilter, SiteFilterBanner } from './SiteFilter';

const sites = (n) => Array.from({ length: n }, (_, i) => ({ id: `s${i + 1}`, name: `Site ${i + 1}` }));

describe('SiteFilter', () => {
  it('renders nothing for a single site', () => {
    const { container } = render(<SiteFilter locations={sites(1)} value={null} onChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('uses segmented buttons up to five sites and reports the selection', () => {
    const onChange = vi.fn();
    render(<SiteFilter locations={sites(3)} value="s2" onChange={onChange} />);
    const group = screen.getByRole('group', { name: /filter by site/i });
    expect(group.querySelectorAll('button')).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Site 2' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Site 3' }));
    expect(onChange).toHaveBeenCalledWith('s3');
    fireEvent.click(screen.getByRole('button', { name: 'All sites' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('falls back to a dropdown beyond five sites', () => {
    render(<SiteFilter locations={sites(6)} value={null} onChange={() => {}} />);
    expect(screen.queryByRole('group')).toBeNull();
    expect(screen.getByRole('combobox', { name: /filter by site/i })).toBeInTheDocument();
  });
});

describe('SiteFilterBanner', () => {
  it('names the site, links to its tasks and clears', () => {
    const onClear = vi.fn();
    render(<MemoryRouter><SiteFilterBanner location={{ id: 's1', name: 'EOC' }} onClear={onClear} /></MemoryRouter>);
    expect(screen.getByRole('status')).toHaveTextContent('EOC');
    expect(screen.getByRole('link', { name: /site tasks/i })).toHaveAttribute('href', '/sites/s1/tasks');
    fireEvent.click(screen.getByRole('button', { name: /show all sites/i }));
    expect(onClear).toHaveBeenCalled();
  });
  it('renders nothing without a site', () => {
    const { container } = render(<SiteFilterBanner location={undefined} onClear={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
