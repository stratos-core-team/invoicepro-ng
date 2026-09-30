import { Bell, Search, Receipt, LogOut, Zap, Crown, Settings, HelpCircle } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sidebar } from '@/components/Sidebar';
import { resetUser } from '@/utils/analytics';
import type { View } from '@/types';

interface HeaderProps {
  businessName: string;
  onSettings: () => void;
  onLogout: () => void;
  onUpgrade: () => void;
  isPro?: boolean;
  currentView: View;
  onNavigate: (view: View) => void;
  userName?: string;
  userEmail?: string;
  invoiceCount?: number;
  invoicesUsed?: number;
  invoiceLimit?: number;
  onSearch?: (query: string) => void;
  onHelp?: () => void;
}

export function Header({
  businessName,
  onSettings,
  onLogout,
  onUpgrade,
  isPro = false,
  currentView,
  onNavigate,
  userName,
  userEmail,
  invoiceCount,
  invoicesUsed,
  invoiceLimit,
  onSearch,
  onHelp,
}: HeaderProps) {
  const [query, setQuery] = useState('');

  const handleLogout = () => {
    // Clear the PostHog identity first, then run the existing logout logic from the parent
    resetUser();
    onLogout();
  };

  return (
    <>
      {/* Desktop sidebar */}
      <Sidebar
        currentView={currentView}
        onNavigate={onNavigate}
        onSettings={onSettings}
        onLogout={handleLogout}
        onUpgrade={onUpgrade}
        isPro={isPro}
        userName={userName || businessName}
        userEmail={userEmail}
        invoiceCount={invoiceCount}
        invoicesUsed={invoicesUsed}
        invoiceLimit={invoiceLimit}
      />

      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-white border-b lg:pl-60">
        <div className="h-14 px-4 lg:px-6 flex items-center gap-3">
          {/* Mobile brand */}
          <div className="flex items-center gap-2 lg:hidden">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
              <Receipt className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-emerald-800 text-sm leading-tight">InvoicePro NG</h1>
              <p className="text-xs text-gray-500 truncate max-w-[120px]">{businessName}</p>
            </div>
          </div>

          {/* Search (desktop) */}
          <div className="hidden lg:flex items-center gap-2 flex-1 max-w-sm h-9 px-3 rounded-lg border border-gray-200 bg-slate-50 focus-within:border-emerald-500 focus-within:bg-white transition-colors">
            <Search className="w-4 h-4 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && query.trim()) onSearch?.(query.trim());
              }}
              placeholder="Search invoices, clients..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
            />
            <kbd className="text-[10px] text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">
              ⌘K
            </kbd>
          </div>

          <div className="ml-auto flex items-center gap-1">
            {/* Mobile plan badge */}
            {!isPro && (
              <button
                onClick={onUpgrade}
                className="lg:hidden flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
              >
                <Zap className="w-3.5 h-3.5" />
                Upgrade
              </button>
            )}
            {isPro && (
              <span className="lg:hidden flex items-center gap-1.5 bg-emerald-50 text-emerald-700 text-xs font-semibold px-3 py-1.5 rounded-lg">
                <Crown className="w-3.5 h-3.5" />
                Pro
              </span>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="relative text-gray-600 hover:text-emerald-700"
              title="Notifications"
            >
              <Bell className="w-5 h-5" />
              <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-emerald-500" />
            </Button>

            <button
              onClick={onHelp}
              className="hidden lg:flex items-center gap-1.5 text-xs text-gray-600 hover:text-emerald-700 px-2 py-1.5 transition-colors"
            >
              <HelpCircle className="w-4 h-4" />
              Help &amp; support
            </button>

            {/* Mobile-only settings + logout (desktop has them in the sidebar) */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onSettings}
              className="lg:hidden text-gray-600 hover:text-emerald-700"
            >
              <Settings className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              className="lg:hidden text-gray-600 hover:text-red-500"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>
    </>
  );
}