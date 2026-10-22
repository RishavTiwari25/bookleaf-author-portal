import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../lib/auth';
import { useLiveTickets, type LiveStatus } from '../lib/useLiveTickets';

const AUTHOR_NAV = [
  { to: '/author', label: 'Dashboard', end: true },
  { to: '/author/books', label: 'My Books' },
  { to: '/author/tickets', label: 'My Tickets', end: true },
  { to: '/author/tickets/new', label: 'Submit Query' },
];
const ADMIN_NAV = [{ to: '/admin', label: 'Ticket Queue', end: true }];

export function Wordmark() {
  return (
    <span className="text-lg font-bold tracking-tight text-slate-900">
      Book<span className="text-brand-700">Leaf</span>
    </span>
  );
}

function LiveIndicator({ status }: { status: LiveStatus }) {
  const live = status === 'live';
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-slate-500"
      title={live ? 'Receiving live updates' : 'Live updates paused; refreshing every 30 s'}
    >
      <span className={`h-2 w-2 rounded-full ${live ? 'bg-emerald-500' : 'animate-pulse bg-amber-400'}`} aria-hidden />
      {live ? 'Live' : status === 'connecting' ? 'Connecting' : 'Reconnecting'}
    </span>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  const liveStatus = useLiveTickets(Boolean(user));
  const nav = user?.role === 'ADMIN' ? ADMIN_NAV : AUTHOR_NAV;

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <Wordmark />
          <span className="hidden text-xs text-slate-400 sm:inline">{user?.role === 'ADMIN' ? 'Support Console' : 'Author Portal'}</span>
          <div className="ml-auto flex items-center gap-4">
            <LiveIndicator status={liveStatus} />
            <span className="hidden text-sm text-slate-600 md:inline">{user?.name}</span>
            <button type="button" onClick={logout} className="btn-secondary px-2.5 py-1.5 text-xs">
              Log out
            </button>
          </div>
          <nav aria-label="Main" className="-mx-1 flex w-full gap-1 overflow-x-auto sm:order-none">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 text-sm whitespace-nowrap ${
                    isActive ? 'bg-brand-50 font-medium text-brand-800' : 'text-slate-600 hover:bg-slate-100'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
