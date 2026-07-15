// @vitest-environment jsdom
//
// wave-e final-review fix: LeadDrawer's Rep <select> options are limited to current
// admin/rep profiles (task 22). If a lead's rep_id belongs to a profile that was since
// demoted/removed from those options, `defaultValue={lead.rep_id}` matches no <option>
// and the browser silently falls back to selecting the FIRST option instead — so any
// unrelated edit-save on that lead would repost a different rep_id and reassign
// attribution. The Service select already solves this same "value not in the option
// list" problem with a `(legacy)` fallback option (components/leads/LeadDrawer.tsx,
// SERVICE_TYPES); this test pins the mirrored fix for the Rep select at the DOM level.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';

afterEach(cleanup);

import { LeadDrawer } from '@/components/leads/LeadDrawer';
import type { Lead } from '@/lib/leads';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/app/(app)/leads/actions', () => ({
  setLeadStatus: vi.fn(async () => ({})),
  createLead: vi.fn(async () => ({})),
  updateLead: vi.fn(async () => ({})),
  deleteLead: vi.fn(async () => ({})),
}));

const lead = (over: Partial<Lead>): Lead => ({
  id: 1, customer_id: 10, status: 'new', service: 'Window Cleaning', description: null,
  stories: 2, panes: 14, note: null, quote_value: null,
  created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
  customer_name: 'Legacy Co', address: '1 Elm St', phone: '555-0100', email: null,
  lat: null, lng: null, rep_id: null, rep_name: null,
  ...over,
});

// Current rep options — deliberately does NOT contain the demoted rep below.
const reps = [{ id: '90000000-0000-0000-0000-000000000031', full_name: 'Current Rep' }];

describe('LeadDrawer Rep select for a rep_id absent from the current options (demoted/legacy)', () => {
  it('renders a (legacy) option so defaultValue resolves to the lead\'s actual rep', () => {
    const l = lead({
      rep_id: '90000000-0000-0000-0000-000000000099',
      rep_name: 'Old Rep',
    });
    const { container, getByText } = render(
      <LeadDrawer lead={l} admin money={true} canEdit backTo="/leads" reps={reps} uid="90000000-0000-0000-0000-000000000031" />
    );
    fireEvent.click(getByText('✎ Edit'));
    const select = container.querySelector('select[name="rep_id"]') as HTMLSelectElement;
    expect(select).toBeTruthy();
    // The legacy option must exist, be labeled from the resolved name, and be the one
    // actually selected — not silently falling back to the first <option> (Current Rep).
    const legacyOption = Array.from(select.options).find(o => o.value === l.rep_id);
    expect(legacyOption?.textContent).toContain('Old Rep');
    expect(legacyOption?.textContent).toContain('(legacy)');
    expect(select.value).toBe(l.rep_id);
  });

  it('falls back to the raw id label when rep_name failed to resolve', () => {
    const l = lead({ rep_id: '90000000-0000-0000-0000-000000000099', rep_name: null });
    const { container, getByText } = render(
      <LeadDrawer lead={l} admin money={true} canEdit backTo="/leads" reps={reps} uid="90000000-0000-0000-0000-000000000031" />
    );
    fireEvent.click(getByText('✎ Edit'));
    const select = container.querySelector('select[name="rep_id"]') as HTMLSelectElement;
    const legacyOption = Array.from(select.options).find(o => o.value === l.rep_id);
    expect(legacyOption?.textContent).toContain(l.rep_id as string);
    expect(select.value).toBe(l.rep_id);
  });

  it('does not add a legacy option when rep_id IS among the current options (control case)', () => {
    const l = lead({ rep_id: reps[0].id, rep_name: reps[0].full_name });
    const { container, getByText } = render(
      <LeadDrawer lead={l} admin money={true} canEdit backTo="/leads" reps={reps} uid={reps[0].id} />
    );
    fireEvent.click(getByText('✎ Edit'));
    const select = container.querySelector('select[name="rep_id"]') as HTMLSelectElement;
    expect(select.options.length).toBe(reps.length);
    expect(select.value).toBe(reps[0].id);
  });
});

describe('LeadDrawer money prop (Task 8: rep quote UI widening)', () => {
  it('rep (money, not admin) sees the quote value but no Delete button', () => {
    const l = lead({ quote_value: 250 });
    const { container, queryByText } = render(
      <LeadDrawer lead={l} admin={false} money={true} canEdit backTo="/leads" reps={reps} uid={reps[0].id} />
    );
    expect(container.textContent).toContain('$250');
    expect(container.textContent).not.toContain('•••••');
    expect(queryByText('🗑 Delete')).toBeNull();
  });

  it('cleaner-shaped caller (money=false) still sees masked quote', () => {
    const l = lead({ quote_value: 250 });
    const { container } = render(
      <LeadDrawer lead={l} admin={false} money={false} canEdit backTo="/leads" reps={reps} uid={reps[0].id} />
    );
    expect(container.textContent).toContain('•••••');
  });

  it('rep sees the Quote $ input in edit mode', () => {
    const l = lead({ quote_value: 250 });
    const { container, getByText } = render(
      <LeadDrawer lead={l} admin={false} money={true} canEdit backTo="/leads" reps={reps} uid={reps[0].id} />
    );
    fireEvent.click(getByText('✎ Edit'));
    const input = container.querySelector('input[name="quote"]');
    expect(input).toBeTruthy();
  });
});
