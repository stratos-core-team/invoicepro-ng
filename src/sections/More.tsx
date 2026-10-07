import {
  Settings,
  Building2,
  Palette,
  Hash,
  Percent,
  CircleDollarSign,
  CreditCard,
  BellRing,
  Repeat,
  Bell,
  ShieldCheck,
  Crown,
  HelpCircle,
  MessageCircle,
  ChevronRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { BusinessInfo } from '@/types';
import { trackEvent, resetUser } from '@/utils/analytics';
import { getBrand } from '@/sections/BusinessBranding';


interface MoreProps {
  businessInfo: BusinessInfo;
  isPro?: boolean;
  invoicesUsed: number;
  invoiceLimit?: number;
  appVersion?: string;
  onSettings: () => void;
  onUpgrade: () => void;
  onHelp: () => void;
  onFeedback: () => void;
  onLogout: () => void;
  onBusiness: () => void;
}

interface RowProps {
  icon: LucideIcon;
  label: string;
  value?: string;
  soon?: boolean;
  onClick: () => void;
}

/* ---------- Small UI helpers (outside the component) ---------- */

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="px-1 pt-2 pb-2 text-[11px] font-semibold tracking-widest text-slate-400 uppercase">
      {children}
    </p>
  );
}

function Row({ icon: Icon, label, value, soon, onClick }: RowProps) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl text-left hover:bg-slate-50 transition-colors"
    >
      <span className="w-10 h-10 shrink-0 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-600">
        <Icon className="w-[18px] h-[18px]" />
      </span>
      <span className="flex-1 min-w-0 text-[15px] font-semibold text-gray-900 truncate">
        {label}
      </span>
      {soon ? (
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Soon
        </span>
      ) : (
        value && (
          <span className="shrink-0 max-w-[40%] truncate text-sm text-gray-500">{value}</span>
        )
      )}
      <ChevronRight className="w-4 h-4 shrink-0 text-gray-400" />
    </button>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-2 space-y-0.5">
      {children}
    </div>
  );
}

/* ---------- Component ---------- */

export function More({
  businessInfo,
  isPro = false,
  invoicesUsed,
  invoiceLimit = 30,
  appVersion = '1.0.0',
  onSettings,
  onUpgrade,
  onHelp,
  onFeedback,
  onLogout,
  onBusiness
}: MoreProps) {
  const initials =
    businessInfo.name
      .split(' ')
      .filter(Boolean)
      .map((word) => word[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'IP';

  // Every tap is tracked. Items that aren't built yet say so instead of doing nothing.
  const open = (key: string, label: string, action?: () => void) => () => {
    trackEvent('more_item_clicked', { item: key });
    if (action) {
      action();
    } else {
      toast.info(`${label} is coming soon`);
    }
  };

  const handleSignOut = () => {
    trackEvent('more_sign_out_clicked', {});
    // Clear the PostHog identity first, then run the app's logout logic
    resetUser();
    onLogout();
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24 lg:pb-8">
      {/* Header */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 leading-tight">More</h2>
            <p className="text-xs text-gray-600">Profile &amp; business settings</p>
          </div>
          <button
            onClick={open('header_settings', 'Settings', onSettings)}
            aria-label="Settings"
            className="w-11 h-11 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-gray-700 transition-colors"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 pt-5 space-y-4">
        {/* Profile card */}
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 shrink-0 rounded-full bg-emerald-500 text-white text-xl font-bold flex items-center justify-center">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-bold text-gray-900 truncate">{businessInfo.name}</p>
              {businessInfo.email && (
                <p className="text-sm text-gray-500 truncate">{businessInfo.email}</p>
              )}
            </div>
            <button
              onClick={open('profile_edit', 'Edit profile', onBusiness)}
              className="shrink-0 text-sm font-semibold text-emerald-600 hover:text-emerald-700"
            >
              Edit
            </button>
          </div>

          <div className="mt-4 flex items-center justify-between rounded-xl bg-[#0d1b24] px-4 py-3">
            <div>
              <p className="text-sm font-bold text-white">{isPro ? 'Pro plan' : 'Free plan'}</p>
              <p className="text-xs text-slate-400">
                {invoicesUsed} of {invoiceLimit} invoices used
              </p>
            </div>
            <button
              onClick={open('plan_manage', 'Plan', onUpgrade)}
              className="text-sm font-semibold text-emerald-400 hover:text-emerald-300"
            >
              {isPro ? 'Manage' : 'Upgrade'}
            </button>
          </div>
        </div>

        {/* Business */}
        <div>
          <SectionLabel>Business</SectionLabel>
          <Card>
            <Row
              icon={Building2}
              label="Business profile"
              value={businessInfo.name}
              onClick={open('business_profile', 'Business profile', onBusiness)}
            />
            <Row
                icon={Palette}
                label="Invoice branding"
                value={getBrand(businessInfo.brandColor).name}
                onClick={open('invoice_branding', 'Invoice branding', onBusiness)}
            />
            <Row
              icon={Hash}
              label="Invoice numbering"
              value={`INV-${new Date().getFullYear()}-###`}
              onClick={open('invoice_numbering', 'Invoice numbering')}
            />
            <Row
              icon={Percent}
              label="Taxes"
              value="VAT 7.5%"
              onClick={open('taxes', 'Tax settings')}
            />
            <Row
              icon={CircleDollarSign}
              label="Currencies"
              value="NGN, USD +2"
              onClick={open('currencies', 'Currency settings')}
            />
          </Card>
        </div>

        {/* Payments & automation */}
        <div>
          <SectionLabel>Payments &amp; automation</SectionLabel>
          <Card>
            <Row
              icon={CreditCard}
              label="Payment methods"
              soon
              onClick={open('payment_methods', 'Payment methods')}
            />
            <Row
              icon={BellRing}
              label="Payment reminders"
              soon
              onClick={open('payment_reminders', 'Payment reminders')}
            />
            <Row
              icon={Repeat}
              label="Recurring invoices"
              soon
              onClick={open('recurring_invoices', 'Recurring invoices')}
            />
          </Card>
        </div>

        {/* Account */}
        <div>
          <SectionLabel>Account</SectionLabel>
          <Card>
            <Row
              icon={Bell}
              label="Notifications"
              soon
              onClick={open('notifications', 'Notifications')}
            />
            <Row
              icon={ShieldCheck}
              label="Security"
              soon
              onClick={open('security', 'Security')}
            />
            <Row
              icon={Crown}
              label="Subscription"
              value={isPro ? 'Pro' : 'Free'}
              onClick={open('subscription', 'Subscription', onUpgrade)}
            />
            <Row
              icon={HelpCircle}
              label="Help & support"
              onClick={open('help_support', 'Help & support', onHelp)}
            />
            <Row
              icon={MessageCircle}
              label="Send feedback"
              onClick={open('send_feedback', 'Feedback', onFeedback)}
            />
          </Card>
        </div>

        {/* Storage status + version */}
        <div className="flex items-center justify-between rounded-xl bg-white border border-gray-100 shadow-sm px-4 py-3">
          <span className="flex items-center gap-2 text-sm text-gray-700">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Saved on this device
          </span>
          <span className="text-xs text-gray-400">v{appVersion}</span>
        </div>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          className="w-full h-12 rounded-xl border-2 border-emerald-600 bg-white text-base font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}