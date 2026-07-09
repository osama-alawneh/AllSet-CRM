// @vitest-environment jsdom
//
// Money model Task 4: JobDrawer's Members panel + join-request workflow (migrations
// 0023/0024). Pins the visibility matrix at the DOM level: cleaners can request to join
// a claimed job's pot, an owner (or admin) can decide pending requests, and — the money
// visibility matrix's cleaner half — the string "Price" must never reach a cleaner's DOM,
// even as a masked placeholder (the old money-hidden dots behavior is gone by design).
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

describe('JobDrawer members panel + join requests', () => {
  it('(a) cleaner non-member on a claimed job sees Request to join', () => {
    const members = [member({})]; // just the owner
    const { getByText } = render(
      <JobDrawer
        job={job({})} role="cleaner" uid={NON_MEMBER_CLEANER} admin={false}
        members={members}
      />
    );
    expect(getByText('Request to join')).toBeTruthy();
  });

  it('(b) owner sees Approve/Reject on a pending member', () => {
    const members = [
      member({}),
      member({ id: 2, cleaner_id: OTHER_CLEANER, cleaner_name: 'Pending Cleaner', status: 'pending', is_owner: false }),
    ];
    const { getByText } = render(
      <JobDrawer
        job={job({})} role="cleaner" uid={OWNER} admin={false}
        members={members}
      />
    );
    expect(getByText('Approve')).toBeTruthy();
    expect(getByText('Reject')).toBeTruthy();
  });

  it('(c) non-owner approved cleaner sees neither decide buttons nor a request-to-join button', () => {
    const members = [
      member({}),
      member({ id: 2, cleaner_id: OTHER_CLEANER, cleaner_name: 'Second Cleaner', status: 'approved', is_owner: false }),
      member({ id: 3, cleaner_id: NON_MEMBER_CLEANER, cleaner_name: 'Pending Cleaner', status: 'pending', is_owner: false }),
    ];
    const { queryByText } = render(
      <JobDrawer
        job={job({})} role="cleaner" uid={OTHER_CLEANER} admin={false}
        members={members}
      />
    );
    expect(queryByText('Approve')).toBeNull();
    expect(queryByText('Reject')).toBeNull();
    expect(queryByText('Request to join')).toBeNull();
  });

  it('(d) cleaner sees pot + share text, and the string "Price" is absent from their drawer', () => {
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
    expect(text).toContain('Pot');
    expect(text).toContain('Your share');
    expect(text).toContain('$50'); // 100 / 2 approved members
    expect(text).not.toContain('Price');
  });

  it('(e) rep sees the price and the ✎ Edit button (spec: rep = admin on job money)', () => {
    const members = [member({})];
    const { getByText } = render(
      <JobDrawer
        job={job({})} role="rep" uid={OTHER_CLEANER} admin={false}
        members={members}
      />
    );
    expect(getByText('✎ Edit')).toBeTruthy();
    expect(getByText('$200')).toBeTruthy(); // job.price
  });
});
