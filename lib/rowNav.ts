import type { useRouter } from 'next/navigation';

// Keyboard-accessible row nav, mirroring the row pattern in CustomersTable/InvoicesTable.
export const rowNav = (router: ReturnType<typeof useRouter>, href: string) => ({
  role: 'button' as const,
  tabIndex: 0,
  onClick: () => router.push(href, { scroll: false }),
  onKeyDown: (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      router.push(href, { scroll: false });
    }
  },
});
