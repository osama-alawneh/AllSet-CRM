// @vitest-environment jsdom
//
// Task 8 Step 1: Sidebar (and, by the same rendering logic, MobileNav's wrapped copy of it)
// gets a red unclaimed-jobs count badge on the Jobs nav item only, for admin + cleaner roles
// (rep always gets `null` from the layout — see app/(app)/layout.tsx). `unclaimedCount` is
// optional (number | null); 0 or null/omitted renders no `.navbadge` anywhere — badge absent
// beats a crash, and a zero count isn't worth flagging.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}));

import { Sidebar } from '@/components/shell/Sidebar';

afterEach(cleanup);

describe('Sidebar unclaimed-jobs badge', () => {
  it('renders the count inside a .navbadge on the Jobs item ("/jobs") when unclaimedCount is truthy', () => {
    const { container } = render(<Sidebar role="admin" name="Alice" unclaimedCount={3} />);
    const jobsLink = container.querySelector('a[href="/jobs"]')!;
    expect(jobsLink).not.toBeNull();
    const badge = jobsLink.querySelector('.navbadge');
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe('3');
    expect(badge!.getAttribute('aria-label')).toBe('3 unclaimed jobs');
  });

  it('does not render a badge on any other nav item', () => {
    const { container } = render(<Sidebar role="admin" name="Alice" unclaimedCount={3} />);
    const dashboardLink = container.querySelector('a[href="/dashboard"]')!;
    expect(dashboardLink.querySelector('.navbadge')).toBeNull();
    expect(container.querySelectorAll('.navbadge')).toHaveLength(1);
  });

  it('renders no .navbadge anywhere when unclaimedCount is 0', () => {
    const { container } = render(<Sidebar role="admin" name="Alice" unclaimedCount={0} />);
    expect(container.querySelector('.navbadge')).toBeNull();
  });

  it('renders no .navbadge anywhere when unclaimedCount is null (rep)', () => {
    const { container } = render(<Sidebar role="rep" name="Bob" unclaimedCount={null} />);
    expect(container.querySelector('.navbadge')).toBeNull();
  });

  it('renders no .navbadge anywhere when unclaimedCount is omitted', () => {
    const { container } = render(<Sidebar role="cleaner" name="Cara" />);
    expect(container.querySelector('.navbadge')).toBeNull();
  });
});
