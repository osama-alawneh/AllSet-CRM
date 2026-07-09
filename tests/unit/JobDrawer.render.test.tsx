// @vitest-environment jsdom
//
// Money model Task 3: JobDrawer polish (migration 0027) — pins the drawer's DOM contract for
// Task 10's owner walkthrough: (a) members render as a table below the actions row instead of
// the old minirow list, (b) an empty member set still renders a table with a placeholder row,
// (c) per-member share $ figures are gone — the cleaner's own "your share" line is the ONLY
// share figure left in the drawer, (d) the join-request button lives in the actions row and
// flips to a disabled "Requested" state once the viewer has a pending request of their own,
// (e) recurrence metadata (↻ Repeats / Spawned from / the edit-form recur_days input) is
// admin/rep-only — the string "Repeat" must never reach a cleaner's DOM, (f) the money
// visibility matrix's rep half — rep sees Price and can edit (rep = admin on job money).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';

afterEach(cleanup);

import { JobDrawer } from '@/components/jobs/JobDrawer';
import type { Job, JobMember } from '@/lib/jobs';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/app/(app)/jobs/actions', () => ({
  claimJob: vi.fn(async () => ({})),
  setJobStatus: vi.fn(async () => ({})),
  createJob: vi.fn(async () => ({})),
  updateJob: vi.fn(async () => ({})),
  deleteJob: vi.fn(async () => ({})),
  requestJoin: vi.fn(async () => ({})),
  decideJoin: vi.fn(async () => ({})),
}));
vi.mock('@/app/(app)/invoices/actions', () => ({
  createInvoiceFromJob: vi.fn(async () => ({})),
}));

const OWNER = '90000000-0000-0000-0000-000000000001';
const OTHER_CLEANER = '90000000-0000-0000-0000-000000000002';
const NON_MEMBER_CLEANER = '90000000-0000-0000-0000-000000000003';

const job = (over: Partial<Job>): Job => ({
  id: 1, customer_id: 10, lead_id: null, status: 'claimed',
  claimed_by: OWNER, claimed_by_name: 'Owner Cleaner',
  scheduled_date: null, service: 'Window Cleaning', description: null,
  price: 200, cleaner_amount: 100, done_at: null, recur_days: null, recur_parent_id: null,
  created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
  customer_name: 'Acme Co', address: '1 Elm St', phone: '555-0100', email: null,
  ...over,
});

const member = (over: Partial<JobMember>): JobMember => ({
  id: 1, job_id: 1, cleaner_id: OWNER, cleaner_name: 'Owner Cleaner',
  status: 'approved', is_owner: true,
  ...over,
});

describe('JobDrawer members table + join requests', () => {
  it('(a) members render as a table: owner (★ + "owner"), approved, and pending rows; Approve/Reject gated by canDecide', () => {
    const members = [
      member({}), // owner, approved
      member({ id: 2, cleaner_id: OTHER_CLEANER, cleaner_name: 'Second Cleaner', status: 'approved', is_owner: false }),
      member({ id: 3, cleaner_id: NON_MEMBER_CLEANER, cleaner_name: 'Pending Cleaner', status: 'pending', is_owner: false }),
    ];
    const { container, getByText } = render(
      <JobDrawer job={job({})} role="admin" uid={OWNER} admin members={members} />
    );
    const table = container.querySelector('.tblwrap > table.tbl');
    expect(table).toBeTruthy();
    const rows = table!.querySelectorAll('tbody tr');
    expect(rows.length).toBe(3);
    expect(container.textContent).toContain('Owner Cleaner ★');
    expect(container.textContent).toContain('owner');
    expect(getByText('Approve')).toBeTruthy();
    expect(getByText('Reject')).toBeTruthy();

    // non-owner APPROVED viewer without decide rights: no Approve/Reject anywhere, and no
    // join-request slot either (pins showJoinSlot's `myMember?.status !== 'approved'` guard).
    cleanup();
    const nonDecider = render(
      <JobDrawer job={job({})} role="cleaner" uid={OTHER_CLEANER} admin={false} members={members} />
    );
    expect(nonDecider.queryByText('Approve')).toBeNull();
    expect(nonDecider.queryByText('Reject')).toBeNull();
    expect(nonDecider.queryByText('Request to join')).toBeNull();
    expect(nonDecider.queryByText('Requested')).toBeNull();
  });

  it('(b) an empty member set on a claimed job still renders a table with a "no joiners requested" row', () => {
    const { container, getByText } = render(
      <JobDrawer job={job({})} role="admin" uid={OWNER} admin members={[]} />
    );
    const table = container.querySelector('.tblwrap > table.tbl');
    expect(table).toBeTruthy();
    const rows = table!.querySelectorAll('tbody tr');
    expect(rows.length).toBe(1);
    expect(rows[0].querySelectorAll('td')[0].getAttribute('colspan')).toBe('3');
    expect(getByText('no joiners requested')).toBeTruthy();
  });

  it('(c) per-member share $ figures are gone from the table — "your share" is the only share figure', () => {
    const members = [
      member({}),
      member({ id: 2, cleaner_id: NON_MEMBER_CLEANER, cleaner_name: 'Me', status: 'approved', is_owner: false }),
    ];
    const { container } = render(
      <JobDrawer
        job={job({ cleaner_amount: 100 })} role="cleaner" uid={NON_MEMBER_CLEANER} admin={false}
        members={members}
      />
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Your share');
    const shareOccurrences = text.split('$50').length - 1;
    expect(shareOccurrences).toBe(1); // 100 / 2 approved members, appears once (the "your share" line)
    expect(text).not.toContain('Price');
  });

  it('(d) non-member cleaner sees "Request to join" in the actions row; once own-pending, a disabled "Requested" button renders in the same slot', () => {
    const members = [member({})]; // just the owner
    const { getByText, queryByText, rerender } = render(
      <JobDrawer job={job({})} role="cleaner" uid={NON_MEMBER_CLEANER} admin={false} members={members} />
    );
    const requestBtn = getByText('Request to join') as HTMLButtonElement;
    expect(requestBtn.closest('.acts')).toBeTruthy();
    expect(queryByText('Requested')).toBeNull();

    const pendingMembers = [
      member({}),
      member({ id: 2, cleaner_id: NON_MEMBER_CLEANER, cleaner_name: 'Me', status: 'pending', is_owner: false }),
    ];
    rerender(
      <JobDrawer job={job({})} role="cleaner" uid={NON_MEMBER_CLEANER} admin={false} members={pendingMembers} />
    );
    expect(queryByText('Request to join')).toBeNull();
    const requestedBtn = getByText('Requested') as HTMLButtonElement;
    expect(requestedBtn.closest('.acts')).toBeTruthy();
    expect(requestedBtn.disabled).toBe(true);
  });

  it('(e) admin sees "↻ every 14 days" for recur_days: 14; cleaner drawer never contains the string "Repeat"', () => {
    const members = [member({})];
    const admin = render(
      <JobDrawer job={job({ recur_days: 14 })} role="admin" uid={OWNER} admin members={members} />
    );
    expect(admin.container.textContent).toContain('↻');
    expect(admin.container.textContent).toContain('every 14 days');
    cleanup();

    const cleanerView = render(
      <JobDrawer job={job({ recur_days: 14 })} role="cleaner" uid={OWNER} admin={false} members={members} />
    );
    expect(cleanerView.container.textContent ?? '').not.toContain('Repeat');
  });

  it('(f) rep sees the price and the ✎ Edit button (spec: rep = admin on job money)', () => {
    const members = [member({})];
    const { getByText } = render(
      <JobDrawer job={job({})} role="rep" uid={OTHER_CLEANER} admin={false} members={members} />
    );
    expect(getByText('Price')).toBeTruthy();
    expect(getByText('$200')).toBeTruthy(); // job.price
    expect(getByText('✎ Edit')).toBeTruthy();
  });
});
