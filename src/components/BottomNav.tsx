import { Home, FileText, Users, CreditCard, MoreHorizontal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import type { View } from '@/types';
import { cn } from '@/lib/utils';

/** Bottom nav destinations: your existing views plus the two new tabs */
export type NavView = View | 'payments' | 'more';

interface BottomNavProps {
  currentView: string;
  onNavigate: (view: NavView) => void;
}

const navItems: { view: NavView; label: string; icon: LucideIcon }[] = [
  { view: 'dashboard' as View, label: 'Home', icon: Home },
  { view: 'invoices' as View, label: 'Invoices', icon: FileText },
  { view: 'customers' as View, label: 'Clients', icon: Users },
  { view: 'payments', label: 'Payments', icon: CreditCard },
  { view: 'more', label: 'More', icon: MoreHorizontal },
];

// Pages that belong under the More tab
const MORE_PAGES = ['more', 'settings', 'upgrade', 'contact', 'feedback'];

export function BottomNav({ currentView, onNavigate }: BottomNavProps) {
  const [visible, setVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      if (currentScrollY < 10) {
        setVisible(true);
      } else if (currentScrollY > lastScrollY.current) {
        setVisible(false);
      } else {
        setVisible(true);
      }

      lastScrollY.current = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const isActive = (view: NavView) =>
    view === 'more' ? MORE_PAGES.includes(currentView) : currentView === view;

  return (
    <nav
      className={cn(
        // Mobile/tablet only: desktop uses the sidebar
        'lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t z-50 transition-transform duration-300 ease-in-out',
        visible ? 'translate-y-0' : 'translate-y-full'
      )}
    >
      <div className="flex justify-around items-center h-16">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.view);

          return (
            <button
              key={item.view}
              onClick={() => onNavigate(item.view)}
              className={cn(
                'flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors',
                active ? 'text-emerald-600' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              <Icon className={cn('w-5 h-5', active && 'stroke-[2.5]')} />
              <span className={cn('text-[11px]', active ? 'font-bold' : 'font-medium')}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}