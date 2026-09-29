import {
  FileText,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Wallet,
  MoreHorizontal,
  ChevronDown,
  Download,
  BellRing,
  Eye,
  CircleDollarSign,
  Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Invoice, DashboardStats } from '@/types';
import { useMemo, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { trackEvent } from '@/utils/analytics';
import { EVENTS } from '@/analytics/events';

interface DashboardProps {
  invoices: Invoice[];
  onCreateInvoice: () => void;
  onViewInvoices: () => void;
  onViewCustomers: () => void;
  onViewInvoicesByStatus?: (status: string) => void;
  /** Full name of the signed-in user, used for the greeting */
  userName?: string;
  /** Optional: wire up to your export/report logic */
  onExportReport?: () => void;
}

const cardClass = 'bg-white border border-gray-200 rounded-xl';

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
  }).format(amount);

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

const getInitials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join('');

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

const timeAgo = (dateString: string) => {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const mins = Math.max(1, Math.floor(diffMs / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

const statusStyles: Record<string, string> = {
  paid: 'bg-emerald-50 text-emerald-700',
  unpaid: 'bg-amber-50 text-amber-700',
  overdue: 'bg-red-50 text-red-600',
};

const statusLabel = (status: string) => (status === 'unpaid' ? 'Pending' : status);

export function Dashboard({
  invoices,
  onCreateInvoice,
  onViewInvoices,
  onViewCustomers: _onViewCustomers,
  onViewInvoicesByStatus,
  userName,
  onExportReport,
}: DashboardProps) {
  useEffect(() => {
    trackEvent(EVENTS.DASHBOARD_VIEWED, {
      invoices_count: invoices.length,
    });
  }, [invoices.length]);

  const stats = useMemo<DashboardStats>(() => {
    const totalInvoices = invoices.length;
    const totalRevenue = invoices
      .filter((inv) => inv.status === 'paid')
      .reduce((sum, inv) => sum + inv.total, 0);
    const unpaidCount = invoices.filter((inv) => inv.status === 'unpaid').length;
    const pendingAmount = invoices
      .filter((inv) => inv.status === 'unpaid' || inv.status === 'overdue')
      .reduce((sum, inv) => sum + inv.total, 0);
    const paidCount = invoices.filter((inv) => inv.status === 'paid').length;
    const overdueCount = invoices.filter((inv) => inv.status === 'overdue').length;

    return { totalInvoices, totalRevenue, unpaidCount, pendingAmount, paidCount, overdueCount };
  }, [invoices]);

  // ---- Extra numbers used by the new design ----
  const extra = useMemo(() => {
    const now = new Date();
    const thisKey = now.getFullYear() * 12 + now.getMonth();

    let paidThisMonth = 0;
    let revenueThisMonth = 0;
    let revenueLastMonth = 0;
    let overdueAmount = 0;
    let pendingOnlyAmount = 0;
    let totalInvoiced = 0;

    invoices.forEach((inv) => {
      const d = new Date(inv.issueDate);
      const key = d.getFullYear() * 12 + d.getMonth();
      totalInvoiced += inv.total;

      if (inv.status === 'paid') {
        if (key === thisKey) {
          paidThisMonth += 1;
          revenueThisMonth += inv.total;
        } else if (key === thisKey - 1) {
          revenueLastMonth += inv.total;
        }
      }
      if (inv.status === 'overdue') overdueAmount += inv.total;
      if (inv.status === 'unpaid') pendingOnlyAmount += inv.total;
    });

    const growth =
      revenueLastMonth > 0
        ? ((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100
        : null;

    return {
      paidThisMonth,
      growth,
      overdueAmount,
      pendingOnlyAmount,
      totalInvoiced,
      awaitingCount: stats.unpaidCount + stats.overdueCount,
    };
  }, [invoices, stats.unpaidCount, stats.overdueCount]);

  // ---- Last 6 months chart data ----
  const monthly = useMemo(() => {
    const now = new Date();
    const buckets: { key: number; label: string; billed: number; collected: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({
        key: d.getFullYear() * 12 + d.getMonth(),
        label: d.toLocaleDateString('en-NG', { month: 'short' }),
        billed: 0,
        collected: 0,
      });
    }
    invoices.forEach((inv) => {
      const d = new Date(inv.issueDate);
      const bucket = buckets.find((b) => b.key === d.getFullYear() * 12 + d.getMonth());
      if (!bucket) return;
      bucket.billed += inv.total;
      if (inv.status === 'paid') bucket.collected += inv.total;
    });
    return buckets;
  }, [invoices]);

  const chartMax = Math.max(...monthly.map((m) => m.billed), 1);

  const recentInvoices = useMemo(() => invoices.slice(0, 5), [invoices]);

  const recentActivity = useMemo(
    () =>
      invoices.slice(0, 4).map((inv) => {
        if (inv.status === 'paid') {
          return {
            id: inv.id,
            title: 'Payment received',
            detail: `${inv.customerName} paid ${inv.invoiceNumber}`,
            time: timeAgo(inv.issueDate),
            icon: CircleDollarSign,
            tone: 'bg-emerald-50 text-emerald-600',
          };
        }
        if (inv.status === 'overdue') {
          return {
            id: inv.id,
            title: 'Invoice overdue',
            detail: `${inv.invoiceNumber} is past its due date`,
            time: timeAgo(inv.issueDate),
            icon: AlertTriangle,
            tone: 'bg-red-50 text-red-500',
          };
        }
        return {
          id: inv.id,
          title: 'Invoice sent',
          detail: `${inv.invoiceNumber} sent to ${inv.customerName}`,
          time: timeAgo(inv.issueDate),
          icon: Send,
          tone: 'bg-blue-50 text-blue-500',
        };
      }),
    [invoices]
  );

  // ---- Payment status bar ----
  const paidPct = extra.totalInvoiced > 0 ? Math.round((stats.totalRevenue / extra.totalInvoiced) * 100) : 0;
  const share = (value: number) =>
    extra.totalInvoiced > 0 ? (value / extra.totalInvoiced) * 100 : 0;

  // ---- Handlers (analytics preserved) ----
  const handleCreateInvoice = (source: string) => {
    trackEvent(EVENTS.CREATE_INVOICE_CLICKED, {
      source,
      from_view: 'dashboard',
    });
    onCreateInvoice();
  };

  const handleViewInvoices = (source: string) => {
    trackEvent(EVENTS.INVOICES_PAGE_VIEWED, {
      source,
      from_view: 'dashboard',
    });
    onViewInvoices();
  };

  const handleViewInvoicesByStatus = (status: string, source: string) => {
    trackEvent('dashboard_invoice_status_clicked', {
      status,
      source,
      from_view: 'dashboard',
    });
    onViewInvoicesByStatus?.(status);
  };

  const firstName = userName?.trim().split(' ')[0];
  const monthName = new Date().toLocaleDateString('en-NG', { month: 'long' });

  return (
    <div className="p-4 md:p-6 max-w-[1200px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
            {getGreeting()}
            {firstName ? `, ${firstName}` : ''}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Here&apos;s how your business is doing this {monthName}.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={onExportReport}
            className="border-emerald-600 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-700 bg-white"
          >
            <Download className="w-4 h-4 mr-2" />
            Export report
          </Button>
          <Button
            onClick={() => handleCreateInvoice('dashboard_header_button')}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create invoice
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={cn(cardClass, 'p-4')}>
          <div className="flex items-start justify-between">
            <p className="text-xs text-gray-500">Total revenue</p>
            <span className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
              <Wallet className="w-4 h-4 text-emerald-600" />
            </span>
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-2">{formatCurrency(stats.totalRevenue)}</p>
          <p className="text-xs mt-1 text-emerald-600 flex items-center gap-1">
            {extra.growth !== null ? (
              <>
                <TrendingUp className="w-3 h-3" />
                {Math.abs(extra.growth).toFixed(1)}% {extra.growth >= 0 ? 'up' : 'down'} from last month
              </>
            ) : (
              <span className="text-gray-400">{stats.paidCount} paid invoice(s)</span>
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={() => handleViewInvoicesByStatus('unpaid', 'dashboard_pending_card')}
          className={cn(cardClass, 'p-4 text-left hover:shadow-md transition-shadow')}
        >
          <div className="flex items-start justify-between">
            <p className="text-xs text-gray-500">Outstanding</p>
            <span className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
              <Clock className="w-4 h-4 text-amber-500" />
            </span>
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-2">{formatCurrency(stats.pendingAmount)}</p>
          <p className="text-xs mt-1 text-emerald-600">
            {extra.awaitingCount} invoice(s) awaiting payment
          </p>
        </button>

        <button
          type="button"
          onClick={() => handleViewInvoicesByStatus('paid', 'dashboard_paid_card')}
          className={cn(cardClass, 'p-4 text-left hover:shadow-md transition-shadow')}
        >
          <div className="flex items-start justify-between">
            <p className="text-xs text-gray-500">Paid invoices</p>
            <span className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-blue-500" />
            </span>
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-2">{stats.paidCount}</p>
          <p className="text-xs mt-1 text-emerald-600 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            {extra.paidThisMonth} this month
          </p>
        </button>

        <button
          type="button"
          onClick={() => handleViewInvoicesByStatus('overdue', 'dashboard_overdue_card')}
          className={cn(cardClass, 'p-4 text-left hover:shadow-md transition-shadow')}
        >
          <div className="flex items-start justify-between">
            <p className="text-xs text-gray-500">Overdue</p>
            <span className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-red-500" />
            </span>
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-2">{formatCurrency(extra.overdueAmount)}</p>
          <p className="text-xs mt-1 text-red-500">
            {stats.overdueCount} invoice(s) need attention
          </p>
        </button>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-4">
          {/* Revenue overview */}
          <div className={cn(cardClass, 'p-5')}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h3 className="font-semibold text-gray-900">Revenue overview</h3>
                <p className="text-xs text-gray-500 mt-0.5">Billed and collected over the last 6 months</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-200" />
                    Billed
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-600" />
                    Collected
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 border border-emerald-600 text-emerald-700 text-xs font-medium rounded-lg px-3 py-1.5">
                  Last 6 months
                  <ChevronDown className="w-3 h-3" />
                </span>
              </div>
            </div>

            <div className="mt-6 flex items-end justify-between gap-2 sm:gap-4 h-48">
              {monthly.map((m) => (
                <div key={m.key} className="flex-1 h-full flex flex-col items-center justify-end gap-2">
                  <div className="flex items-end justify-center gap-1 sm:gap-1.5 w-full flex-1">
                    <div
                      className="w-3 sm:w-5 rounded-t-md bg-emerald-200"
                      style={{ height: `${Math.max((m.billed / chartMax) * 100, m.billed > 0 ? 4 : 1)}%` }}
                      title={`Billed: ${formatCurrency(m.billed)}`}
                    />
                    <div
                      className="w-3 sm:w-5 rounded-t-md bg-emerald-600"
                      style={{ height: `${Math.max((m.collected / chartMax) * 100, m.collected > 0 ? 4 : 1)}%` }}
                      title={`Collected: ${formatCurrency(m.collected)}`}
                    />
                  </div>
                  <span className="text-[11px] text-gray-400">{m.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent invoices */}
          <div className={cn(cardClass, 'overflow-hidden')}>
            <div className="flex items-center justify-between p-5 pb-3">
              <h3 className="font-semibold text-gray-900">Recent invoices</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleViewInvoices('dashboard_recent_invoices_view_all')}
                className="border-emerald-600 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-700 bg-white"
              >
                View all
              </Button>
            </div>

            {recentInvoices.length === 0 ? (
              <div className="p-8 pt-4 text-center">
                <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 mb-1">No invoices yet</p>
                <p className="text-gray-400 text-sm mb-4">
                  Create your first invoice to start tracking payments
                </p>
                <Button
                  onClick={() => handleCreateInvoice('dashboard_empty_state')}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create your first invoice
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-y border-gray-100 bg-gray-50/50">
                      <th className="font-medium px-5 py-2.5">Invoice</th>
                      <th className="font-medium px-3 py-2.5">Client</th>
                      <th className="font-medium px-3 py-2.5">Date</th>
                      <th className="font-medium px-3 py-2.5">Amount</th>
                      <th className="font-medium px-3 py-2.5">Status</th>
                      <th className="px-5 py-2.5 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {recentInvoices.map((invoice) => (
                      <tr
                        key={invoice.id}
                        onClick={() => handleViewInvoices('dashboard_recent_invoice_card')}
                        className="border-b border-gray-100 last:border-0 hover:bg-gray-50 cursor-pointer transition-colors"
                      >
                        <td className="px-5 py-3.5 font-medium text-gray-900 whitespace-nowrap">
                          {invoice.invoiceNumber}
                        </td>
                        <td className="px-3 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <span className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-semibold flex items-center justify-center shrink-0">
                              {getInitials(invoice.customerName)}
                            </span>
                            <span className="text-gray-700 truncate max-w-[140px]">{invoice.customerName}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3.5 text-gray-500 whitespace-nowrap">
                          {formatDate(invoice.issueDate)}
                        </td>
                        <td className="px-3 py-3.5 font-semibold text-gray-900 whitespace-nowrap">
                          {formatCurrency(invoice.total)}
                        </td>
                        <td className="px-3 py-3.5">
                          <span
                            className={cn(
                              'text-xs px-2.5 py-0.5 rounded-md capitalize font-medium',
                              statusStyles[invoice.status] ?? 'bg-gray-100 text-gray-600'
                            )}
                          >
                            {statusLabel(invoice.status)}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-gray-400">
                          <MoreHorizontal className="w-4 h-4" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Payment status */}
          <div className={cn(cardClass, 'p-5')}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Payment status</h3>
              <button
                type="button"
                onClick={() => handleViewInvoices('dashboard_payment_status_view_report')}
                className="text-xs font-medium text-emerald-600 hover:text-emerald-700"
              >
                View report
              </button>
            </div>

            <p className="text-2xl font-bold text-gray-900 mt-3">{formatCurrency(stats.totalRevenue)}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {paidPct}% of {formatCurrency(extra.totalInvoiced)} invoiced
            </p>

            <div className="flex h-2 rounded-full overflow-hidden bg-gray-100 mt-4 gap-0.5">
              <div className="bg-emerald-500" style={{ width: `${share(stats.totalRevenue)}%` }} />
              <div className="bg-amber-400" style={{ width: `${share(extra.pendingOnlyAmount)}%` }} />
              <div className="bg-red-500" style={{ width: `${share(extra.overdueAmount)}%` }} />
            </div>

            <div className="mt-4 space-y-2.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-gray-600">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Paid
                </span>
                <span className="font-semibold text-gray-900">{formatCurrency(stats.totalRevenue)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-gray-600">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  Pending
                </span>
                <span className="font-semibold text-gray-900">{formatCurrency(extra.pendingOnlyAmount)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-gray-600">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  Overdue
                </span>
                <span className="font-semibold text-gray-900">{formatCurrency(extra.overdueAmount)}</span>
              </div>
            </div>

            {stats.overdueCount > 0 && (
              <button
                type="button"
                onClick={() => handleViewInvoicesByStatus('overdue', 'dashboard_payment_status_reminder')}
                className="mt-4 w-full flex items-center gap-2 rounded-lg bg-amber-50 text-amber-700 text-xs px-3 py-2.5 text-left hover:bg-amber-100 transition-colors"
              >
                <BellRing className="w-3.5 h-3.5 shrink-0" />
                {stats.overdueCount} invoice(s) need a payment reminder
              </button>
            )}
          </div>

          {/* Recent activity */}
          <div className={cn(cardClass, 'p-5')}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Recent activity</h3>
              <button
                type="button"
                onClick={() => handleViewInvoices('dashboard_recent_activity_see_all')}
                className="text-xs font-medium text-emerald-600 hover:text-emerald-700"
              >
                See all
              </button>
            </div>

            {recentActivity.length === 0 ? (
              <div className="text-center py-6">
                <Eye className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Activity will show up here</p>
              </div>
            ) : (
              <ul className="mt-4 space-y-4">
                {recentActivity.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.id} className="flex items-start gap-3">
                      <span
                        className={cn(
                          'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
                          item.tone
                        )}
                      >
                        <Icon className="w-4 h-4" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{item.title}</p>
                        <p className="text-xs text-gray-500 truncate">{item.detail}</p>
                      </div>
                      <span className="text-[11px] text-gray-400 shrink-0">{item.time}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}