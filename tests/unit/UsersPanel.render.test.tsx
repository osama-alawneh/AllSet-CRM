// @vitest-environment jsdom
//
// Money model Task 6: UsersPanel's create-user form moves behind a "Create user" button
// + side Drawer (same create-flow convention as ExpensesSection/Task 5: button + Drawer,
// closes on successful create, stays open with the role=alert message on error). The
// users table itself, and the existing fields (incl. phone/DOB) and autofill guards
// (autoComplete="off"/"new-password"), are unchanged.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup, screen, waitFor } from '@testing-library/react';

afterEach(cleanup);

import { UsersPanel, type PanelUser } from '@/components/settings/UsersPanel';

const createUser = vi.fn<(fd: FormData) => Promise<{ error?: string }>>(async () => ({}));
const setUserRole = vi.fn<(id: string, role: string) => Promise<{ error?: string }>>(async () => ({}));
vi.mock('@/app/(app)/settings/actions', () => ({
  createUser: (fd: FormData) => createUser(fd),
  setUserRole: (id: string, role: string) => setUserRole(id, role),
}));

const users: PanelUser[] = [
  {
    id: 'u1', full_name: 'Alice Admin', role: 'admin', email: 'alice@example.com',
    created_at: '2026-07-01', phone: '555-0100', dob: '1990-01-01',
  },
  {
    id: 'u2', full_name: 'Bob Rep', role: 'rep', email: 'bob@example.com',
    created_at: '2026-07-02', phone: null, dob: null,
  },
];

const openDrawer = () => {
  render(<UsersPanel users={users} meId="u1" />);
  fireEvent.click(screen.getByRole('button', { name: '+ Create user' }));
};

describe('UsersPanel', () => {
  it('renders the users table without an inline create form', () => {
    render(<UsersPanel users={users} meId="u1" />);

    expect(screen.getByText('Alice Admin')).toBeTruthy();
    expect(screen.getByText('Bob Rep')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByLabelText('Full name')).toBeNull();
  });

  it('opens a dialog with the create-user form (incl. phone/DOB) when "Create user" is clicked', () => {
    openDrawer();

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(screen.getByLabelText('Full name')).toBeTruthy();
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(screen.getByLabelText('Role')).toBeTruthy();
    expect(screen.getByLabelText('Phone')).toBeTruthy();
    expect(screen.getByLabelText('DOB')).toBeTruthy();
  });

  it('submits the create form via the createUser server action and closes the dialog on success', async () => {
    openDrawer();

    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Cara Cleaner' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'cara@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password1' } });
    fireEvent.click(screen.getByText('+ Create'));

    await waitFor(() => expect(createUser).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('shows the inline form error when createUser fails and keeps the dialog open', async () => {
    createUser.mockResolvedValueOnce({ error: 'Email already in use' });
    openDrawer();

    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Cara Cleaner' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'cara@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password1' } });
    fireEvent.click(screen.getByText('+ Create'));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Email already in use'));
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  // Final-review fix: the only role=alert used to live inside the create Drawer, so a failed
  // role change with the drawer closed was a silent snap-back. Role-change errors now have
  // their own alert surface next to the users table, visible without the drawer.
  it('shows a visible role=alert error when setUserRole fails, without the drawer being open', async () => {
    setUserRole.mockResolvedValueOnce({ error: 'Cannot demote the last admin' });
    render(<UsersPanel users={users} meId="u1" />);

    fireEvent.change(screen.getByLabelText('Role for Bob Rep'), { target: { value: 'cleaner' } });

    await waitFor(() => expect(setUserRole).toHaveBeenCalledWith('u2', 'cleaner'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Cannot demote the last admin'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
