import { Home, FileText, Users, PlusCircle } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import type { View } from '@/types';
import { cn } from '@/lib/utils';
import { trackEvent } from '@/utils/analytics';
import { EVENTS } from '@/analytics/events';

interface BottomNavProps {
  currentView: View;
  onNavigate: (view: View) => void;
}

const navItems = [
  { view: 'dashboard' as View, label: 'Overview', icon: Home },
  { view: 'invoices' as View, label: 'Invoices', icon: FileText },
  { view: 'customers' as View, label: 'Clients', icon: Users },
];

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
          const isActive = currentView === item.view;
          return (
            <button
              key={item.view}
              onClick={() => onNavigate(item.view)}
              className={cn(
                'flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors',
                isActive ? 'text-emerald-600' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              <Icon className={cn('w-5 h-5', isActive && 'fill-current')} />
              <span className="text-xs font-medium">{item.label}</span>
            </button>
          );
        })}

        <button
          onClick={() => {
            trackEvent(EVENTS.CREATE_INVOICE_CLICKED, {
              source: 'bottom_nav',
              from_view: currentView,
            });

            onNavigate('create-invoice');
          }}
          className="flex flex-col items-center justify-center gap-1 flex-1 h-full text-emerald-600"
        >
          <div className="w-10 h-10 bg-emerald-600 rounded-full flex items-center justify-center -mt-4 shadow-lg">
            <PlusCircle className="w-6 h-6 text-white" />
          </div>
          <span className="text-xs font-medium">New</span>
        </button>
      </div>
    </nav>
  );
}