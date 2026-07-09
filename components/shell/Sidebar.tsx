import type { Role } from '@/lib/auth';
import { navForRole } from '@/lib/nav';
import { NavLink } from './NavLink';
import { SignOutButton } from './SignOutButton';

export function Sidebar({
  role, name, unclaimedCount,
}: {
  role: Role; name: string; unclaimedCount?: number | null;
}) {
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  return (
    <aside className="side box">
      <div className="brand">
        <div className="logo">◇</div>
        <div>
          <b>AllSet</b>
          <small>BLUEPRINT+</small>
        </div>
      </div>
      <nav className="nav">
        {navForRole(role).map(i => (
          <NavLink
            key={i.href}
            {...i}
            badge={i.href === '/jobs' && unclaimedCount ? (
              <span className="navbadge" aria-label={`${unclaimedCount} unclaimed jobs`}>{unclaimedCount}</span>
            ) : null}
          />
        ))}
      </nav>
      <div className="foot">
        <div className="who">
          <div className="av">{initial}</div>
          <div>
            <b>{name}</b>
            <small>ROLE: {role.toUpperCase()}</small>
          </div>
        </div>
        <SignOutButton />
      </div>
    </aside>
  );
}
