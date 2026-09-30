import { useState, useMemo, useEffect } from 'react';
import {
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  ChevronRight,
  Plus,
  Download,
  CheckCircle,
  Trash2,
  Send,
  FileText,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { Invoice, BusinessInfo } from '@/types';
import { toast } from 'sonner';
import { generateInvoicePDF } from '@/lib/pdfGenerator';
import { cn } from '@/lib/utils';
import { trackEvent } from '@/utils/analytics';
import { EVENTS } from '@/analytics/events';

interface InvoiceListProps {
  invoices: Invoice[];
  businessInfo: BusinessInfo;
  onMarkAsPaid: (id: string) => void;
  onDelete: (id: string) => void;
  onCreateNew: () => void;
  initialStatusFilter?: string;
}

/* ---------- Types & constants ---------- */

type DisplayStatus = 'draft' | 'unpaid' | 'paid' | 'overdue';
type StatusFilter = 'all' | DisplayStatus;
type SortBy = 'newest' | 'oldest' | 'highest' | 'lowest';
type DateRange = 'all' | 'month' | '30d';

const PAGE_SIZE = 5;
const DAY_MS = 86400000;

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'unpaid', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
];

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'highest', label: 'Highest amount' },
  { value: 'lowest', label: 'Lowest amount' },
];

const DATE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: 'month', label: 'This month' },
  { value: '30d', label: 'Last 30 days' },
];

const STATUS_LABEL: Record<DisplayStatus, string> = {
  draft: 'Draft',
  unpaid: 'Pending',
  paid: 'Paid',
  overdue: 'Overdue',
};

const STATUS_PILL: Record<DisplayStatus, string> = {
  draft: 'bg-slate-100 text-slate-600',
  unpaid: 'bg-amber-50 text-amber-600',
  paid: 'bg-emerald-50 text-emerald-700',
  overdue: 'bg-red-50 text-red-500',
};

/* ---------- Helpers (outside the component so they are always defined) ---------- */

const parseDate = (value: string) =>
  value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);

const endOfDay = (value: string) => {
  const d = parseDate(value);
  d.setHours(23, 59, 59, 999);
  return d;
};

/** Always show overdue correctly if the due date has passed */
const getDisplayStatus = (invoice: Invoice): DisplayStatus => {
  const status = invoice.status as string;
  if (status === 'paid') return 'paid';
  if (status === 'draft') return 'draft';
  if (endOfDay(invoice.dueDate) < new Date()) return 'overdue';
  return 'unpaid';
};

const daysLate = (invoice: Invoice) =>
  Math.max(1, Math.ceil((Date.now() - endOfDay(invoice.dueDate).getTime()) / DAY_MS));

const formatMoney = (amount: number, currency = 'NGN', decimals = 2) =>
  new Intl.NumberFormat(currency === 'NGN' ? 'en-NG' : 'en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);

const formatShort = (value: string) =>
  parseDate(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const formatFull = (value: string) =>
  parseDate(value).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

const createdTime = (invoice: Invoice) =>
  new Date(invoice.createdAt ?? invoice.issueDate).getTime();

const metaLine = (invoice: Invoice, status: DisplayStatus) => {
  switch (status) {
    case 'paid':
      return invoice.paidAt
        ? `${formatShort(invoice.issueDate)} · paid ${formatShort(invoice.paidAt)}`
        : `${formatShort(invoice.issueDate)} · due ${formatShort(invoice.dueDate)}`;
    case 'overdue': {
      const days = daysLate(invoice);
      return `${formatShort(invoice.issueDate)} · ${days} day${days === 1 ? '' : 's'} late`;
    }
    case 'draft':
      return `Updated ${formatShort(invoice.createdAt ?? invoice.issueDate)}`;
    default:
      return `${formatShort(invoice.issueDate)} · due ${formatShort(invoice.dueDate)}`;
  }
};

const isStatusFilter = (value: string): value is StatusFilter =>
  ['all', 'draft', 'unpaid', 'paid', 'overdue'].includes(value);

/* ---------- Component ---------- */

export function InvoiceList({
  invoices,
  businessInfo,
  onMarkAsPaid,
  onDelete,
  onCreateNew,
  initialStatusFilter = 'all',
}: InvoiceListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    isStatusFilter(initialStatusFilter) ? initialStatusFilter : 'all'
  );
  const [sortBy, setSortBy] = useState<SortBy>('newest');
  const [dateRange, setDateRange] = useState<DateRange>('all');
  const [menu, setMenu] = useState<'sort' | 'filter' | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  useEffect(() => {
    trackEvent(EVENTS.INVOICES_PAGE_VIEWED, {
      invoices_count: invoices.length,
      initial_status_filter: initialStatusFilter,
    });
  }, [invoices.length, initialStatusFilter]);

  // Start from the first page whenever the list changes shape
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchQuery, statusFilter, sortBy, dateRange]);

  /* ---------- Derived data ---------- */

  // Only NGN invoices are added up, so mixed currencies never get summed together
  const billedTotal = useMemo(
    () =>
      invoices
        .filter((inv) => (inv.currency ?? 'NGN') === 'NGN')
        .reduce((sum, inv) => sum + inv.total, 0),
    [invoices]
  );

  const filteredInvoices = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const now = new Date();

    const list = invoices.filter((invoice) => {
      const matchesSearch =
        !query ||
        invoice.invoiceNumber.toLowerCase().includes(query) ||
        invoice.customerName.toLowerCase().includes(query);

      const matchesStatus = statusFilter === 'all' || getDisplayStatus(invoice) === statusFilter;

      let matchesDate = true;
      if (dateRange !== 'all') {
        const issued = parseDate(invoice.issueDate);
        matchesDate =
          dateRange === 'month'
            ? issued.getFullYear() === now.getFullYear() && issued.getMonth() === now.getMonth()
            : now.getTime() - issued.getTime() <= 30 * DAY_MS;
      }

      return matchesSearch && matchesStatus && matchesDate;
    });

    return [...list].sort((a, b) => {
      switch (sortBy) {
        case 'oldest':
          return createdTime(a) - createdTime(b);
        case 'highest':
          return b.total - a.total;
        case 'lowest':
          return a.total - b.total;
        default:
          return createdTime(b) - createdTime(a);
      }
    });
  }, [invoices, searchQuery, statusFilter, sortBy, dateRange]);

  const visibleInvoices = filteredInvoices.slice(0, visibleCount);
  const hasActiveFilters = searchQuery !== '' || statusFilter !== 'all' || dateRange !== 'all';
  const currentSortLabel = SORT_OPTIONS.find((o) => o.value === sortBy)?.label ?? 'Newest';

  /* ---------- Handlers ---------- */

  const handleView = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setIsViewOpen(true);

    trackEvent(EVENTS.INVOICE_VIEWED, {
      invoice_id: invoice.id,
      invoice_number: invoice.invoiceNumber,
      customer_id: invoice.customerId,
      amount: invoice.total,
      status: getDisplayStatus(invoice),
      source: 'invoice_list',
    });
  };

  const handleDownload = async (invoice: Invoice, source: string = 'invoice_list') => {
    try {
      toast.loading('Generating PDF...');

      await generateInvoicePDF(invoice, businessInfo);

      trackEvent(EVENTS.INVOICE_DOWNLOADED_PDF, {
        invoice_id: invoice.id,
        invoice_number: invoice.invoiceNumber,
        customer_id: invoice.customerId,
        amount: invoice.total,
        status: getDisplayStatus(invoice),
        source,
      });

      toast.dismiss();
      toast.success('PDF downloaded successfully!');
    } catch {
      toast.dismiss();
      toast.error('Failed to generate PDF');
    }
  };

  const handleMarkAsPaid = (id: string) => {
    const invoice = invoices.find((inv) => inv.id === id);

    onMarkAsPaid(id);

    if (invoice) {
      trackEvent(EVENTS.INVOICE_MARKED_PAID, {
        invoice_id: invoice.id,
        invoice_number: invoice.invoiceNumber,
        customer_id: invoice.customerId,
        amount: invoice.total,
        previous_status: invoice.status,
      });
    }

    toast.success('Invoice marked as paid!');

    if (selectedInvoice?.id === id) {
      setSelectedInvoice((prev) =>
        prev ? { ...prev, status: 'paid' as const, paidAt: new Date().toISOString() } : null
      );
    }
  };

  const handleDelete = (id: string) => {
    const invoice = invoices.find((inv) => inv.id === id);

    if (confirm('Are you sure you want to delete this invoice?')) {
      onDelete(id);

      if (invoice) {
        trackEvent(EVENTS.INVOICE_DELETED, {
          invoice_id: invoice.id,
          invoice_number: invoice.invoiceNumber,
          customer_id: invoice.customerId,
          amount: invoice.total,
          status: invoice.status,
        });
      }

      toast.success('Invoice deleted');

      if (selectedInvoice?.id === id) {
        setIsViewOpen(false);
        setSelectedInvoice(null);
      }
    }
  };

  const handleSendToClient = async (invoice: Invoice, source: string = 'invoice_list') => {
    if (!invoice.customerEmail) {
      toast.error('No email address on record for this client.');
      return;
    }

    setSendingEmail(true);

    try {
      const currency = invoice.currency ?? 'NGN';
      const subject = encodeURIComponent(
        `Invoice ${invoice.invoiceNumber} from ${businessInfo.name}`
      );

      const body = encodeURIComponent(
        `Hi ${invoice.customerName},\n\nPlease find attached your invoice ${invoice.invoiceNumber} for ${formatMoney(invoice.total, currency)}.\n\nDue Date: ${formatFull(invoice.dueDate)}\n\nThank you for your business.\n\n${businessInfo.name}`
      );

      window.location.href = `mailto:${invoice.customerEmail}?subject=${subject}&body=${body}`;

      trackEvent(EVENTS.INVOICE_SENT, {
        invoice_id: invoice.id,
        invoice_number: invoice.invoiceNumber,
        customer_id: invoice.customerId,
        customer_email: invoice.customerEmail,
        amount: invoice.total,
        status: getDisplayStatus(invoice),
        source,
        method: 'mailto',
      });

      toast.success('Email client opened with invoice details.');
    } catch {
      toast.error('Failed to open email client.');
    } finally {
      setSendingEmail(false);
    }
  };

  const handleCreateNew = (source: string) => {
    trackEvent(EVENTS.CREATE_INVOICE_CLICKED, {
      source,
      from_view: 'invoices_page',
    });

    onCreateNew();
  };

  const handleStatusFilterChange = (value: StatusFilter, source: string) => {
    setStatusFilter(value);

    trackEvent(EVENTS.INVOICE_FILTER_CHANGED, {
      filter_type: 'status',
      value,
      source,
    });
  };

  const handleSortChange = (value: SortBy) => {
    setSortBy(value);
    setMenu(null);
    trackEvent(EVENTS.INVOICE_FILTER_CHANGED, {
      filter_type: 'sort',
      value,
      source: 'sort_menu',
    });
  };

  const handleDateRangeChange = (value: DateRange) => {
    setDateRange(value);
    setMenu(null);
    trackEvent(EVENTS.INVOICE_FILTER_CHANGED, {
      filter_type: 'date_range',
      value,
      source: 'filter_menu',
    });
  };

  const handleLoadMore = () => {
    trackEvent('invoice_list_load_more', {
      shown: visibleCount,
      total: filteredInvoices.length,
    });
    setVisibleCount((count) => count + PAGE_SIZE);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setDateRange('all');
    handleStatusFilterChange('all', 'clear_filters');
  };

  /* ---------- Render ---------- */

  return (
    <div className="min-h-screen bg-slate-50 pb-24 lg:pb-8">
      {/* Header */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 leading-tight">Invoices</h2>
            <p className="text-xs text-gray-600">
              {invoices.length} invoice{invoices.length === 1 ? '' : 's'} ·{' '}
              {formatMoney(billedTotal, 'NGN', 0)} billed
            </p>
          </div>
          <button
            onClick={() => handleCreateNew('invoices_header_button')}
            aria-label="New invoice"
            className="w-11 h-11 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-gray-800 transition-colors"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 pt-5 space-y-4">
        {/* Search */}
        <div className="relative">
          <div className="flex items-center gap-3 h-14 rounded-2xl border border-gray-200 bg-white px-4">
            <Search className="w-5 h-5 text-gray-400 shrink-0" />
            <input
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);

                trackEvent(EVENTS.INVOICE_SEARCH_USED, {
                  query_length: e.target.value.length,
                  query: e.target.value,
                });
              }}
              placeholder="Search invoice or client"
              className="flex-1 min-w-0 bg-transparent text-[15px] text-gray-900 outline-none placeholder:text-gray-400"
            />
            <button
              onClick={() => setMenu(menu === 'filter' ? null : 'filter')}
              aria-label="Filter by date"
              className={cn(
                'shrink-0 p-1 transition-colors',
                dateRange !== 'all' ? 'text-emerald-600' : 'text-gray-500 hover:text-gray-800'
              )}
            >
              <SlidersHorizontal className="w-5 h-5" />
            </button>
          </div>

          {menu === 'filter' && (
            <>
              <button
                aria-hidden
                tabIndex={-1}
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setMenu(null)}
              />
              <div className="absolute right-0 top-full mt-2 z-20 w-48 rounded-xl bg-white border border-gray-100 shadow-lg py-1.5">
                <p className="px-3 pb-1 pt-0.5 text-[10px] font-semibold tracking-widest text-gray-400">
                  DATE ISSUED
                </p>
                {DATE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleDateRangeChange(option.value)}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-700 hover:bg-slate-50"
                  >
                    {option.label}
                    {dateRange === option.value && <Check className="w-4 h-4 text-emerald-600" />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Status tabs */}
        <div className="grid grid-cols-5 gap-1 rounded-2xl bg-slate-200/70 p-1.5">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => handleStatusFilterChange(tab.value, 'status_tab')}
              className={cn(
                'h-10 rounded-xl text-sm transition-colors',
                statusFilter === tab.value
                  ? 'bg-white text-emerald-700 font-bold shadow-sm'
                  : 'text-gray-600 font-medium hover:text-gray-900'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Count + sort */}
        <div className="relative flex items-center justify-between">
          <p className="text-sm text-gray-600">
            Showing {filteredInvoices.length} invoice{filteredInvoices.length === 1 ? '' : 's'}
          </p>
          <button
            onClick={() => setMenu(menu === 'sort' ? null : 'sort')}
            className="flex items-center gap-1.5 text-sm font-bold text-gray-900"
          >
            <ArrowUpDown className="w-4 h-4" />
            {currentSortLabel}
          </button>

          {menu === 'sort' && (
            <>
              <button
                aria-hidden
                tabIndex={-1}
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setMenu(null)}
              />
              <div className="absolute right-0 top-full mt-2 z-20 w-48 rounded-xl bg-white border border-gray-100 shadow-lg py-1.5">
                {SORT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleSortChange(option.value)}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-700 hover:bg-slate-50"
                  >
                    {option.label}
                    {sortBy === option.value && <Check className="w-4 h-4 text-emerald-600" />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Invoice list */}
        {filteredInvoices.length === 0 ? (
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-8 text-center">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            {hasActiveFilters ? (
              <>
                <p className="text-gray-500 mb-2">No invoices match your search</p>
                <button
                  onClick={clearFilters}
                  className="text-emerald-600 text-sm font-medium hover:underline"
                >
                  Clear filters
                </button>
              </>
            ) : (
              <>
                <p className="text-gray-500 mb-4">No invoices yet</p>
                <Button
                  onClick={() => handleCreateNew('invoices_empty_state')}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  Create Your First Invoice
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {visibleInvoices.map((invoice) => {
              const status = getDisplayStatus(invoice);

              return (
                <button
                  key={invoice.id}
                  onClick={() => handleView(invoice)}
                  className="w-full text-left rounded-2xl bg-white border border-gray-100 shadow-sm px-4 pt-4 pb-3.5 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[15px] font-bold text-gray-900">{invoice.invoiceNumber}</p>
                      <p className="text-sm text-gray-600 truncate">{invoice.customerName}</p>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-3 py-1 text-xs font-semibold',
                        STATUS_PILL[status]
                      )}
                    >
                      {STATUS_LABEL[status]}
                    </span>
                  </div>

                  <div className="mt-3 pt-3 border-t border-gray-100 flex items-center">
                    <span className="w-[45%] text-xs text-gray-400 truncate">
                      {metaLine(invoice, status)}
                    </span>
                    <span className="flex-1 text-lg font-bold text-gray-900">
                      {formatMoney(invoice.total, invoice.currency ?? 'NGN')}
                    </span>
                    <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Load more */}
        {filteredInvoices.length > visibleCount && (
          <div className="text-center py-2">
            <button
              onClick={handleLoadMore}
              className="text-sm font-bold text-emerald-700 hover:text-emerald-800"
            >
              Load more invoices
            </button>
            <p className="text-xs text-gray-400 mt-0.5">
              {visibleCount} of {filteredInvoices.length} shown
            </p>
          </div>
        )}

        {/* New invoice */}
        <button
          onClick={() => handleCreateNew('invoices_bottom_button')}
          className="w-full h-14 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-base font-semibold text-white transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New invoice
        </button>
      </div>

      {/* View Invoice Dialog */}
      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedInvoice &&
            (() => {
              const currency = selectedInvoice.currency ?? 'NGN';
              const status = getDisplayStatus(selectedInvoice);
              const discount = selectedInvoice.discount ?? 0;

              return (
                <>
                  <DialogHeader>
                    <DialogTitle className="flex items-center justify-between pr-6">
                      <span>{selectedInvoice.invoiceNumber}</span>
                      <Badge className={cn('capitalize border-0', STATUS_PILL[status])}>
                        {STATUS_LABEL[status]}
                      </Badge>
                    </DialogTitle>
                  </DialogHeader>

                  <div className="space-y-6 pt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-medium text-gray-500">From</p>
                        <p className="font-semibold">{businessInfo.name}</p>
                        {businessInfo.address && (
                          <p className="text-sm text-gray-600">{businessInfo.address}</p>
                        )}
                        {businessInfo.phone && (
                          <p className="text-sm text-gray-600">{businessInfo.phone}</p>
                        )}
                        {businessInfo.email && (
                          <p className="text-sm text-gray-600">{businessInfo.email}</p>
                        )}
                      </div>

                      <div>
                        <p className="text-sm font-medium text-gray-500">Bill To</p>
                        <p className="font-semibold">{selectedInvoice.customerName}</p>
                        {selectedInvoice.customerAddress && (
                          <p className="text-sm text-gray-600">{selectedInvoice.customerAddress}</p>
                        )}
                        {selectedInvoice.customerPhone && (
                          <p className="text-sm text-gray-600">{selectedInvoice.customerPhone}</p>
                        )}
                        {selectedInvoice.customerEmail && (
                          <p className="text-sm text-gray-600">{selectedInvoice.customerEmail}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-6 flex-wrap">
                      <div>
                        <p className="text-sm font-medium text-gray-500">Issue Date</p>
                        <p>{formatFull(selectedInvoice.issueDate)}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-500">Due Date</p>
                        <p>{formatFull(selectedInvoice.dueDate)}</p>
                      </div>
                      {selectedInvoice.paidAt && (
                        <div>
                          <p className="text-sm font-medium text-gray-500">Paid Date</p>
                          <p className="text-emerald-600">{formatFull(selectedInvoice.paidAt)}</p>
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="text-sm font-medium text-gray-500 mb-2">Items</p>
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="text-left p-3">Description</th>
                              <th className="text-center p-3">Qty</th>
                              <th className="text-right p-3">Unit Price</th>
                              <th className="text-right p-3">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedInvoice.items.map((item, idx) => (
                              <tr key={idx} className="border-t">
                                <td className="p-3">
                                  {item.description}
                                  {item.details && (
                                    <span className="block text-xs text-gray-500">{item.details}</span>
                                  )}
                                </td>
                                <td className="text-center p-3">{item.quantity}</td>
                                <td className="text-right p-3">
                                  {formatMoney(item.unitPrice, currency)}
                                </td>
                                <td className="text-right p-3 font-medium">
                                  {formatMoney(item.total, currency)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Subtotal</span>
                        <span>{formatMoney(selectedInvoice.subtotal, currency)}</span>
                      </div>
                      {discount > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">
                            Discount
                            {selectedInvoice.discountPercent
                              ? ` (${selectedInvoice.discountPercent}%)`
                              : ''}
                          </span>
                          <span>- {formatMoney(discount, currency)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Tax ({selectedInvoice.taxRate}%)</span>
                        <span>{formatMoney(selectedInvoice.tax, currency)}</span>
                      </div>
                      <div className="border-t pt-2 flex justify-between">
                        <span className="font-semibold">Total</span>
                        <span className="font-bold text-lg text-emerald-600">
                          {formatMoney(selectedInvoice.total, currency)}
                        </span>
                      </div>
                    </div>

                    {selectedInvoice.notes && (
                      <div>
                        <p className="text-sm font-medium text-gray-500">Notes</p>
                        <p className="text-sm text-gray-600 mt-1">{selectedInvoice.notes}</p>
                      </div>
                    )}

                    {selectedInvoice.paymentTerms && (
                      <div>
                        <p className="text-sm font-medium text-gray-500">Payment Terms</p>
                        <p className="text-sm text-gray-600 mt-1">{selectedInvoice.paymentTerms}</p>
                      </div>
                    )}

                    <div className="flex gap-3 pt-4 flex-wrap">
                      <Button
                        onClick={() => handleDownload(selectedInvoice, 'invoice_dialog')}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                      >
                        <Download className="w-4 h-4 mr-2" /> Download PDF
                      </Button>

                      <Button
                        variant="outline"
                        onClick={() => handleSendToClient(selectedInvoice, 'invoice_dialog')}
                        className="flex-1 border-blue-500 text-blue-600 hover:bg-blue-50"
                        disabled={sendingEmail}
                      >
                        <Send className="w-4 h-4 mr-2" /> Send to Client
                      </Button>

                      {status !== 'paid' && (
                        <Button
                          variant="outline"
                          onClick={() => handleMarkAsPaid(selectedInvoice.id)}
                          className="flex-1 border-emerald-600 text-emerald-600"
                        >
                          <CheckCircle className="w-4 h-4 mr-2" /> Mark as Paid
                        </Button>
                      )}
                    </div>

                    <button
                      onClick={() => handleDelete(selectedInvoice.id)}
                      className="w-full flex items-center justify-center gap-2 text-sm font-medium text-red-500 hover:text-red-600 pt-1"
                    >
                      <Trash2 className="w-4 h-4" /> Delete invoice
                    </button>
                  </div>
                </>
              );
            })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}