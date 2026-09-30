import {
  Wallet,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Bell,
  MoreHorizontal,
  ArrowUpRight,
  ArrowDownRight,
  ChevronDown,
  FileText,
  Send,
  Banknote,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { Invoice } from '@/types';
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
  onExportReport?: () => void;
  userName?: string;
}

export function Dashboard({
  invoices,
  onCreateInvoice,
  onViewInvoices,
  onViewCustomers: _onViewCustomers,
  onViewInvoicesByStatus,
  onExportReport,
  userName,
}: DashboardProps) {
  useEffect(() => {
    trackEvent(EVENTS.DASHBOARD_VIEWED, {
      invoices_count: invoices.length,
    });
  }, [invoices.length]);

  /* ---------- Derived data ---------- */

  const stats = useMemo(() => {
    const sum = (list: Invoice[]) => list.reduce((s, inv) => s + inv.total, 0);
    const paid = invoices.filter((i) => i.status === 'paid');
    const unpaid = invoices.filter((i) => i.status === 'unpaid');
    const overdue = invoices.filter((i) => i.status === 'overdue');

    const now = new Date();
    const paidThisMonth = paid.filter((i) => {
      const d = new Date(i.issueDate);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;

    return {
      totalRevenue: sum(paid),
      billedTotal: sum(invoices),
      paidCount: paid.length,
      paidThisMonth,
      unpaidCount: unpaid.length,
      unpaidAmount: sum(unpaid),
      overdueCount: overdue.length,
      overdueAmount: sum(overdue),
      outstandingAmount: sum(unpaid) + sum(overdue),
    };
  }, [invoices]);

  // Last 6 months: billed vs collected
  const monthly = useMemo(() => {
    const now = new Date();
    const buckets = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return {
        key: d.getFullYear() * 12 + d.getMonth(),
        label: d.toLocaleDateString('en-NG', { month: 'short' }),
        billed: 0,
        paid: 0,
      };
    });

    invoices.forEach((inv) => {
      const d = new Date(inv.issueDate);
      const key = d.getFullYear() * 12 + d.getMonth();
      const bucket = buckets.find((b) => b.key === key);
      if (!bucket) return;
      bucket.billed += inv.total;
      if (inv.status === 'paid') bucket.paid += inv.total;
    });

    return buckets;
  }, [invoices]);

  const chartMax = Math.max(...monthly.map((m) => m.billed), 1);

  const revenueChange = useMemo(() => {
    const current = monthly[5].paid;
    const previous = monthly[4].paid;
    if (previous <= 0) return null;
    return ((current - previous) / previous) * 100;
  }, [monthly]);

  const recentInvoices = useMemo(() => invoices.slice(0, 5), [invoices]);

  const activity = useMemo(() => {
    return invoices.slice(0, 4).map((inv) => {
      const status = inv.status as string;
      if (status === 'paid') {
        return {
          id: inv.id,
          icon: Banknote,
          tone: 'bg-emerald-50 text-emerald-600',
          title: 'Payment received',
          detail: `${inv.customerName} paid ${inv.invoiceNumber}`,
          date: inv.issueDate,
        };
      }
      if (status === 'overdue') {
        return {
          id: inv.id,
          icon: AlertTriangle,
          tone: 'bg-red-50 text-red-500',
          title: 'Invoice overdue',
          detail: `${inv.invoiceNumber} · ${inv.customerName}`,
          date: inv.issueDate,
        };
      }
      if (status === 'draft') {
        return {
          id: inv.id,
          icon: FileText,
          tone: 'bg-gray-100 text-gray-500',
          title: 'Draft created',
          detail: `${inv.invoiceNumber} · ${inv.customerName}`,
          date: inv.issueDate,
        };
      }
      return {
        id: inv.id,
        icon: Send,
        tone: 'bg-amber-50 text-amber-600',
        title: 'Invoice sent',
        detail: `${inv.invoiceNumber} · ${inv.customerName}`,
        date: inv.issueDate,
      };
    });
  }, [invoices]);

  /* ---------- Formatters ---------- */

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

  const timeAgo = (dateString: string) => {
    const hours = Math.floor((Date.now() - new Date(dateString).getTime()) / 3.6e6);
    if (hours < 1) return 'now';
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d`;
    return `${Math.floor(days / 30)}mo`;
  };

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((p) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

  const getStatusLabel = (status: string) => (status === 'unpaid' ? 'Pending' : status);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-emerald-50 text-emerald-700';
      case 'unpaid':
        return 'bg-amber-50 text-amber-700';
      case 'overdue':
        return 'bg-red-50 text-red-600';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const monthName = new Date().toLocaleDateString('en-NG', { month: 'long' });

  /* ---------- Handlers (analytics preserved) ---------- */

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

  const handleExportReport = () => {
    trackEvent('dashboard_export_report_clicked', { from_view: 'dashboard' });
    onExportReport?.();
  };

  /* ---------- Payment status bar ---------- */

  const statusTotal = stats.totalRevenue + stats.unpaidAmount + stats.overdueAmount;
  const pct = (value: number) => (statusTotal > 0 ? (value / statusTotal) * 100 : 0);
  const collectedPercent =
    stats.billedTotal > 0 ? Math.round((stats.totalRevenue / stats.billedTotal) * 100) : 0;
  const needReminder = stats.unpaidCount + stats.overdueCount;

  const statCards = [
    {
      label: 'Total revenue',
      value: formatCurrency(stats.totalRevenue),
      icon: Wallet,
      iconStyle: 'bg-emerald-50 text-emerald-600',
      sub:
        revenueChange === null ? (
          <span className="text-gray-400">No data for last month</span>
        ) : (
          <span
            className={cn(
              'inline-flex items-center gap-0.5',
              revenueChange >= 0 ? 'text-emerald-600' : 'text-red-500'
            )}
          >
            {revenueChange >= 0 ? (
              <ArrowUpRight className="w-3 h-3" />
            ) : (
              <ArrowDownRight className="w-3 h-3" />
            )}
            {Math.abs(revenueChange).toFixed(1)}% from last month
          </span>
        ),
      onClick: () => handleViewInvoicesByStatus('paid', 'dashboard_total_revenue_card'),
    },
    {
      label: 'Outstanding',
      value: formatCurrency(stats.outstandingAmount),
      icon: Clock,
      iconStyle: 'bg-amber-50 text-amber-500',
      sub: (
        <span className="text-emerald-600">
          {stats.unpaidCount} invoice{stats.unpaidCount === 1 ? '' : 's'} awaiting payment
        </span>
      ),
      onClick: () => handleViewInvoicesByStatus('unpaid', 'dashboard_pending_card'),
    },
    {
      label: 'Paid invoices',
      value: String(stats.paidCount),
      icon: CheckCircle2,
      iconStyle: 'bg-blue-50 text-blue-500',
      sub: <span className="text-emerald-600">{stats.paidThisMonth} this month</span>,
      onClick: () => handleViewInvoicesByStatus('paid', 'dashboard_paid_card'),
    },
    {
      label: 'Overdue',
      value: formatCurrency(stats.overdueAmount),
      icon: AlertTriangle,
      iconStyle: 'bg-red-50 text-red-500',
      sub: (
        <span className="text-red-500">
          {stats.overdueCount} invoice{stats.overdueCount === 1 ? '' : 's'} need attention
        </span>
      ),
      onClick: () => handleViewInvoicesByStatus('overdue', 'dashboard_overdue_card'),
    },
  ];

  return (
    <div className="bg-slate-50 min-h-screen p-4 lg:p-6 pb-24 lg:pb-6">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {greeting}
              {userName ? `, ${userName}` : ''}
            </h2>
            <p className="text-sm text-gray-500">
              Here's how your business is doing this {monthName}.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleExportReport}
              className="border-emerald-600 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-700"
            >
              Export report
            </Button>
            <Button
              onClick={() => handleCreateInvoice('dashboard_header_button')}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Create invoice
            </Button>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          {statCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card
                key={card.label}
                onClick={card.onClick}
                className="p-4 bg-white border border-gray-100 rounded-xl shadow-sm cursor-pointer hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <p className="text-xs text-gray-500">{card.label}</p>
                  <div
                    className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center',
                      card.iconStyle
                    )}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                </div>
                <p className="mt-2 text-2xl font-bold text-gray-900 truncate">{card.value}</p>
                <p className="mt-1 text-[11px]">{card.sub}</p>
              </Card>
            )
          })}
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Revenue overview */}
          <Card className="lg:col-span-2 p-5 bg-white border border-gray-100 rounded-xl shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-gray-900">Revenue overview</h3>
                <p className="text-xs text-gray-500">Billed and collected over the last 6 months</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex items-center gap-3 text-[11px] text-gray-500">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-600" /> Paid
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-200" /> Billed
                  </span>
                </div>
                <button className="flex items-center gap-1 text-xs font-medium text-emerald-700 border border-emerald-600 rounded-lg px-3 py-1.5 hover:bg-emerald-50 transition-colors">
                  Last 6 months
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div className="mt-6 flex items-end justify-between gap-2">
              {monthly.map((m) => (
                <div key={m.key} className="flex-1 flex flex-col items-center gap-2">
                  <div
                    className="flex items-end justify-center gap-1 h-44 w-full"
                    title={`${m.label}: billed ${formatCurrency(m.billed)}, paid ${formatCurrency(m.paid)}`}
                  >
                    <div
                      className="w-4 sm:w-5 rounded-t-md bg-emerald-200 transition-all"
                      style={{ height: `${Math.max((m.billed / chartMax) * 100, 2)}%` }}
                    />
                    <div
                      className="w-4 sm:w-5 rounded-t-md bg-emerald-600 transition-all"
                      style={{ height: `${Math.max((m.paid / chartMax) * 100, 2)}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-gray-400">{m.label}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Payment status */}
          <Card className="p-5 bg-white border border-gray-100 rounded-xl shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Payment status</h3>
              <button
                onClick={() => handleViewInvoices('dashboard_payment_status_view_report')}
                className="text-xs font-medium text-emerald-600 hover:text-emerald-700"
              >
                View report
              </button>
            </div>

            <p className="mt-4 text-2xl font-bold text-gray-900">
              {formatCurrency(stats.totalRevenue)}
            </p>
            <p className="text-xs text-gray-500">
              {collectedPercent}% of {formatCurrency(stats.billedTotal)} invoiced
            </p>

            <div className="mt-4 flex h-2 w-full rounded-full overflow-hidden bg-gray-100">
              <div className="bg-emerald-500" style={{ width: `${pct(stats.totalRevenue)}%` }} />
              <div className="bg-amber-400" style={{ width: `${pct(stats.unpaidAmount)}%` }} />
              <div className="bg-red-500" style={{ width: `${pct(stats.overdueAmount)}%` }} />
            </div>

            <ul className="mt-4 space-y-2 text-sm">
              <li className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-gray-600">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" /> Paid
                </span>
                <span className="font-semibold text-gray-900">
                  {formatCurrency(stats.totalRevenue)}
                </span>
              </li>
              <li className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-gray-600">
                  <span className="w-2 h-2 rounded-full bg-amber-400" /> Pending
                </span>
                <span className="font-semibold text-gray-900">
                  {formatCurrency(stats.unpaidAmount)}
                </span>
              </li>
              <li className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-gray-600">
                  <span className="w-2 h-2 rounded-full bg-red-500" /> Overdue
                </span>
                <span className="font-semibold text-gray-900">
                  {formatCurrency(stats.overdueAmount)}
                </span>
              </li>
            </ul>

            {needReminder > 0 && (
              <button
                onClick={() => handleViewInvoicesByStatus('overdue', 'dashboard_payment_reminder_notice')}
                className="mt-4 w-full flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-left text-xs text-amber-700 hover:bg-amber-100 transition-colors"
              >
                <Bell className="w-3.5 h-3.5 shrink-0" />
                {needReminder} invoice{needReminder === 1 ? '' : 's'} need a payment reminder
              </button>
            )}
          </Card>

          {/* Recent invoices */}
          <Card className="lg:col-span-2 p-5 bg-white border border-gray-100 rounded-xl shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Recent invoices</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleViewInvoices('dashboard_recent_invoices_view_all')}
                className="border-emerald-600 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-700"
              >
                View all
              </Button>
            </div>

            {recentInvoices.length === 0 ? (
              <div className="py-8 text-center">
                <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 mb-2">No invoices yet</p>
                <p className="text-gray-400 text-sm mb-4">
                  Create your first invoice to start tracking payments
                </p>
                <Button
                  onClick={() => handleCreateInvoice('dashboard_empty_state')}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create Your First Invoice
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-sm min-w-[520px]">
                  <thead>
                    <tr className="text-left text-[10px] font-semibold tracking-wider text-gray-400 uppercase">
                      <th className="px-1 pb-2 font-semibold">Invoice</th>
                      <th className="px-1 pb-2 font-semibold">Client</th>
                      <th className="px-1 pb-2 font-semibold">Date</th>
                      <th className="px-1 pb-2 font-semibold text-right">Amount</th>
                      <th className="px-1 pb-2 font-semibold text-center">Status</th>
                      <th className="w-6" />
                    </tr>
                  </thead>
                  <tbody>
                    {recentInvoices.map((invoice) => (
                      <tr
                        key={invoice.id}
                        onClick={() => handleViewInvoices('dashboard_recent_invoice_card')}
                        className="border-t border-gray-100 cursor-pointer hover:bg-slate-50 transition-colors"
                      >
                        <td className="px-1 py-3 font-medium text-gray-900 whitespace-nowrap">
                          {invoice.invoiceNumber}
                        </td>
                        <td className="px-1 py-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-7 h-7 shrink-0 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold flex items-center justify-center">
                              {getInitials(invoice.customerName)}
                            </span>
                            <span className="text-gray-700 truncate">{invoice.customerName}</span>
                          </div>
                        </td>
                        <td className="px-1 py-3 text-gray-500 whitespace-nowrap">
                          {formatDate(invoice.issueDate)}
                        </td>
                        <td className="px-1 py-3 text-right font-semibold text-gray-900 whitespace-nowrap">
                          {formatCurrency(invoice.total)}
                        </td>
                        <td className="px-1 py-3 text-center">
                          <span
                            className={cn(
                              'text-[11px] px-2 py-0.5 rounded-full capitalize font-medium',
                              getStatusColor(invoice.status)
                            )}
                          >
                            {getStatusLabel(invoice.status)}
                          </span>
                        </td>
                        <td className="py-3 text-gray-400">
                          <MoreHorizontal className="w-4 h-4" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Recent activity */}
          <Card className="p-5 bg-white border border-gray-100 rounded-xl shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Recent activity</h3>
              <button
                onClick={() => handleViewInvoices('dashboard_recent_activity_see_all')}
                className="text-xs font-medium text-emerald-600 hover:text-emerald-700"
              >
                See all
              </button>
            </div>

            {activity.length === 0 ? (
              <p className="text-sm text-gray-400">Activity will show up here.</p>
            ) : (
              <ul className="space-y-4">
                {activity.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.id} className="flex items-start gap-3">
                      <span
                        className={cn(
                          'w-8 h-8 shrink-0 rounded-full flex items-center justify-center',
                          item.tone
                        )}
                      >
                        <Icon className="w-4 h-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900">{item.title}</p>
                        <p className="text-xs text-gray-500 truncate">{item.detail}</p>
                      </div>
                      <span className="text-[11px] text-gray-400 shrink-0">
                        {timeAgo(item.date)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}