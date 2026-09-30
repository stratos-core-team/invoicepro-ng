import {
  LayoutDashboard,
  FileText,
  Users,
  CreditCard,
  BarChart3,
  Package,
  Repeat,
  Settings,
  LogOut,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { View } from '@/types';
import { cn } from '@/lib/utils';

interface SidebarProps {
  currentView: View;
  onNavigate: (view: View) => void;
  onSettings: () => void;
  onLogout: () => void;
  onUpgrade: () => void;
  isPro?: boolean;
  userName: string;
  userEmail?: string;
  invoiceCount?: number;
  invoicesUsed?: number;
  invoiceLimit?: number;
}

interface NavItemProps {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  badge?: number;
  title?: string;
  onClick?: () => void;
}

function NavItem({ icon: Icon, label, active, badge, title, onClick }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-left',
        active
          ? 'bg-emerald-600 text-white font-medium'
          : 'text-slate-300 hover:bg-white/5 hover:text-white'
      )}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span>{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="ml-auto text-[10px] font-semibold bg-emerald-500 text-white rounded-full px-1.5 py-0.5 leading-none">
          {badge}
        </span>
      )}
    </button>
  );
}

export function Sidebar({
  currentView,
  onNavigate,
  onSettings,
  onLogout,
  onUpgrade,
  isPro = false,
  userName,
  userEmail,
  invoiceCount,
  invoicesUsed = 0,
  invoiceLimit = 30,
}: SidebarProps) {
  const usagePercent = Math.min(100, Math.round((invoicesUsed / invoiceLimit) * 100));
  const initials = userName
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <aside className="hidden lg:flex fixed left-0 top-0 z-50 h-screen w-60 flex-col bg-[#0d1b24] text-white">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 h-14 border-b border-white/5">
        <div className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center text-sm font-bold">
          I
        </div>
        <span className="font-semibold text-sm">InvoicePro NG</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        <NavItem
          icon={LayoutDashboard}
          label="Overview"
          active={currentView === 'dashboard'}
          onClick={() => onNavigate('dashboard')}
        />
        <NavItem
          icon={FileText}
          label="Invoices"
          badge={invoiceCount}
          active={currentView === 'invoices'}
          onClick={() => onNavigate('invoices')}
        />
        <NavItem
          icon={Users}
          label="Clients"
          active={currentView === 'customers'}
          onClick={() => onNavigate('customers')}
        />
        <NavItem icon={CreditCard} label="Payments" title="Coming soon" />
        <NavItem icon={BarChart3} label="Reports" title="Coming soon" />

        <p className="px-3 pt-6 pb-2 text-[10px] font-semibold tracking-widest text-slate-500">
          WORKSPACE
        </p>

        <NavItem icon={Package} label="Products" title="Coming soon" />
        <NavItem icon={Repeat} label="Recurring" title="Coming soon" />
        <NavItem icon={Settings} label="Settings" onClick={onSettings} />
      </nav>

      {/* Plan card */}
      <div className="px-3 pb-3">
        <div className="rounded-xl bg-white/5 border border-white/10 p-3">
          <p className="text-[10px] font-semibold tracking-widest text-emerald-400">
            {isPro ? 'PRO PLAN' : 'FREE PLAN'}
          </p>
          <p className="text-xs text-slate-300 mt-1">
            {invoicesUsed} of {invoiceLimit} invoices used this month
          </p>
          <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${usagePercent}%` }}
            />
          </div>
          {!isPro && (
            <button
              onClick={onUpgrade}
              className="mt-3 w-full text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg py-1.5 transition-colors"
            >
              Upgrade to Pro
            </button>
          )}
        </div>
      </div>

      {/* User */}
      <div className="flex items-center gap-3 px-4 py-3 border-t border-white/5">
        <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center text-xs font-semibold shrink-0">
          {initials || 'U'}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{userName}</p>
          {userEmail && <p className="text-[11px] text-slate-400 truncate">{userEmail}</p>}
        </div>
        <button
          onClick={onLogout}
          title="Logout"
          className="text-slate-400 hover:text-red-400 transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
}