'use client';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Drawer } from '@/components/ui/Drawer';

export function MobileNav({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // Close on navigation — NavLinks inside are plain <Link>s. Adjust state during
  // render (React's recommended pattern) instead of setState-in-effect.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }
  return (
    <>
      <button type="button" className="iconbtn hamb" aria-label="Open navigation" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        ☰
      </button>
      {open && (
        <Drawer onClose={() => setOpen(false)} labelId="mobile-nav-title" className="drawer-nav">
          <span id="mobile-nav-title" className="lbl">Navigation</span>
          {children}
        </Drawer>
      )}
    </>
  );
}
