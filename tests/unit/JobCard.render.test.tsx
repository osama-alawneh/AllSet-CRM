// @vitest-environment jsdom
//
// Task 4 Step 1: JobCard's meta line must show the zero-padded job number (`#0042`),
// and the pending-join count must render as a single `.pendchip` pill (replacing the
// old amber `.lbl` badge) containing `⏳ 2`, present only when pendingCount is truthy.
//
// dnd-kit's `useDraggable` is mocked (not run inside a real DndContext) — same pattern
// as LeadCard.render.test.tsx — so this asserts JobCard's own rendering in isolation.
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { JobCard } from '@/components/jobs/JobCard';
import type { Job } from '@/lib/jobs';

vi.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    setActivatorNodeRef: () => {},
    transform: null,
    isDragging: false,
  }),
}));

const job: Job = {
  id: 42,
  customer_id: 1,
  lead_id: null,
  status: 'unclaimed',
  claimed_by: null,
  claimed_by_name: null,
  scheduled_date: null,
  service: 'Full clean',
  description: null,
  price: 500,
  cleaner_amount: null,
  done_at: null,
  recur_days: null,
  recur_parent_id: null,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
  customer_name: 'Acme Windows',
  address: '1 Main St',
  phone: '555-1234',
  email: null,
};

function setup(pendingCount?: number) {
  return render(
    <JobCard
      job={job}
      money={true}
      draggable={true}
      canClaim={false}
      pending={false}
      onOpen={vi.fn()}
      onClaim={vi.fn()}
      pendingCount={pendingCount}
    />
  );
}

describe('JobCard job number (Task 4)', () => {
  it('shows the zero-padded job number in the meta line', () => {
    const { container } = setup();
    expect(container.textContent).toContain('#0042');
  });
});

describe('JobCard pending pill (Task 4)', () => {
  it('renders a single .pendchip pill with "⏳ 2" when pendingCount is 2', () => {
    const { container } = setup(2);
    const chips = container.querySelectorAll('.pendchip');
    expect(chips.length).toBe(1);
    expect(chips[0].textContent).toBe('⏳ 2');
  });

  it('omits the .pendchip pill when pendingCount is 0', () => {
    const { container } = setup(0);
    expect(container.querySelectorAll('.pendchip').length).toBe(0);
  });

  it('omits the .pendchip pill when pendingCount is undefined', () => {
    const { container } = setup(undefined);
    expect(container.querySelectorAll('.pendchip').length).toBe(0);
  });

  it('does not render the old amber .lbl badge anymore', () => {
    const { container } = setup(2);
    expect(container.querySelectorAll('.lbl').length).toBe(0);
  });
});
