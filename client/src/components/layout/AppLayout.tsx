import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileTabBar } from './MobileTabBar';
import { useUiStore } from '../../store/uiStore';
import { cn } from '../../utils/cn';

export function AppLayout() {
  const { mobileNavOpen, setMobileNavOpen } = useUiStore();

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg-primary">
      {/* Full-width topbar above the sidebar */}
      <Header />
      {/* Body row - sidebar + main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Persistent desktop rail - hidden under md, normal flex item at md+ */}
        <div className="hidden md:contents">
          <Sidebar />
        </div>
        {/* Extra bottom padding on mobile clears the fixed MobileTabBar */}
        <main className="flex-1 overflow-y-auto p-6 pb-20 md:pb-6">
          <Outlet />
        </main>
      </div>

      {/* Off-canvas navigation drawer (below md only) */}
      <div className={cn('fixed inset-0 z-40 md:hidden', !mobileNavOpen && 'pointer-events-none')}>
        {/* Scrim - tap to close */}
        <div
          onClick={() => setMobileNavOpen(false)}
          className={cn(
            'absolute inset-0 bg-black/60 transition-opacity duration-200',
            mobileNavOpen ? 'opacity-100' : 'opacity-0',
          )}
        />
        {/* Slide-in panel hosting the full sidebar */}
        <div
          className={cn(
            'absolute inset-y-0 left-0 w-64 max-w-[85%] shadow-2xl transition-transform duration-200 ease-out',
            mobileNavOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <Sidebar variant="drawer" />
        </div>
      </div>

      {/* Fixed bottom tab bar (mobile only) */}
      <MobileTabBar />
    </div>
  );
}
