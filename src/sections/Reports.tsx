import { useEffect, useMemo, useState } from 'react';
import { Share2, CalendarDays, ChevronDown, ArrowUp, ArrowDown, Check } from 'lucide-react';
import { toast } from 'sonner';
import type { Invoice, BusinessInfo } from '@/types';
import { cn } from '@/lib/utils';
import { trackEvent } from '@/utils/analytics';

interface ReportsProps {
  invoices: Invoice[];
  businessInfo: BusinessInfo;
  onViewDetails: () => void;
  onExport: () => void;
}

/* ---------- Types & constants ---------- */

type DisplayStatus = 'draft' | 'unpaid' | 'paid' | 'overdue';
type PeriodKey = 'this_month' | 'last_month' | 'last_30' | 'last_3_months' | 'this_year' | 'custom';
type Granularity = 'monthly' | 'weekly';

const DAY_MS = 86400000;

const PERIODS: { value: PeriodKey; label: string }[] = [
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_30', label: 'Last 30 days' },
  { value: 'last_3_months', label: 'Last 3 months' },
  { value: 'this_year', label: 'This year' },
  { value: 'custom', label: 'Custom range' },
];

/* ---------- Date helpers ---------- */

const toISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const parseDate = (value: string) =>
  value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

const addDays = (d: Date, days: number) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);

const getRange = (period: PeriodKey, customStart: string, customEnd: string) => {
  const now = new Date();
  const todayEnd = endOfDay(now);

  switch (period) {
    case 'last_month':
      return {
        start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999),
      };
    case 'last_30':
      return { start: addDays(startOfDay(now), -29), end: todayEnd };
    case 'last_3_months':
      return { start: new Date(now.getFullYear(), now.getMonth() - 2, 1), end: todayEnd };
    case 'this_year':
      return { start: new Date(now.getFullYear(), 0, 1), end: todayEnd };
    case 'custom':
      return {
        start: customStart ? parseDate(customStart) : new Date(now.getFullYear(), now.getMonth(), 1),
        end: customEnd ? endOfDay(parseDate(customEnd)) : todayEnd,
      };
    default:
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: todayEnd };
  }
};

const formatRange = (start: Date, end: Date) => {
  const sameYear = start.getFullYear() === end.getFullYear();
  const short = (d: Date, withYear: boolean) =>
    d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      ...(withYear ? { year: 'numeric' } : {}),
    });
  return `${short(start, !sameYear)} – ${short(end, true)}`;
};

/* ---------- Invoice helpers ---------- */

/** Always show overdue correctly if the due date has passed */
const getDisplayStatus = (invoice: Invoice): DisplayStatus => {
  const status = invoice.status as string;
  if (status === 'paid') return 'paid';
  if (status === 'draft') return 'draft';
  if (endOfDay(parseDate(invoice.dueDate)) < new Date()) return 'overdue';
  return 'unpaid';
};

const currencyOf = (invoice: Invoice) => invoice.currency ?? 'NGN';

const totalsFor = (list: Invoice[]) => {
  let billed = 0;
  let paid = 0;
  let outstanding = 0;
  list.forEach((inv) => {
    const status = getDisplayStatus(inv);
    billed += inv.total;
    if (status === 'paid') paid += inv.total;
    if (status === 'unpaid' || status === 'overdue') outstanding += inv.total;
  });
  return { billed, paid, outstanding };
};

/* ---------- Money helpers ---------- */

const localeFor = (currency: string) => (currency === 'NGN' ? 'en-NG' : 'en-US');

const currencySymbol = (currency: string) =>
  new Intl.NumberFormat(localeFor(currency), { style: 'currency', currency })
    .formatToParts(0)
    .find((p) => p.type === 'currency')?.value ?? currency;

const formatMoney = (amount: number, currency: string) =>
  new Intl.NumberFormat(localeFor(currency), {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);

/** $30.3k, $5.46k, $1.2M */
const compactMoney = (amount: number, currency: string) => {
  const symbol = currencySymbol(currency);
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 999_500) return `${sign}${symbol}${Number((abs / 1e6).toPrecision(3))}M`;
  if (abs >= 1000) return `${sign}${symbol}${Number((abs / 1e3).toPrecision(3))}k`;
  return `${sign}${symbol}${Math.round(abs)}`;
};

/** CSV cell with quoting, plus protection against spreadsheet formula injection in text */
const csvCell = (value: string | number) => {
  if (typeof value === 'number') return String(value);
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

const inputClass =
  'w-full h-12 rounded-xl border border-gray-300 bg-white px-3.5 text-[15px] text-gray-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition';

/* ---------- Component ---------- */

export function Reports({ invoices, businessInfo, onViewDetails, onExport }: ReportsProps) {
  const today = new Date();
  const [period, setPeriod] = useState<PeriodKey>('this_month');
  const [customStart, setCustomStart] = useState(
    toISODate(new Date(today.getFullYear(), today.getMonth(), 1))
  );
  const [customEnd, setCustomEnd] = useState(toISODate(today));
  const [granularity, setGranularity] = useState<Granularity>('monthly');
  const [currencyChoice, setCurrencyChoice] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    trackEvent('reports_viewed', { invoices_count: invoices.length });
  }, [invoices.length]);

  /* ---------- Derived data ---------- */

  const range = useMemo(
    () => getRange(period, customStart, customEnd),
    [period, customStart, customEnd]
  );
  const rangeValid = range.start <= range.end;
  const rangeLabel = formatRange(range.start, range.end);

  // Drafts have not been billed, so they never count in reports
  const billable = useMemo(
    () => invoices.filter((inv) => getDisplayStatus(inv) !== 'draft'),
    [invoices]
  );

  const inRange = useMemo(() => {
    if (!rangeValid) return [];
    return billable.filter((inv) => {
      const issued = parseDate(inv.issueDate);
      return issued >= range.start && issued <= range.end;
    });
  }, [billable, range, rangeValid]);

  const availableCurrencies = useMemo(
    () => [...new Set(inRange.map(currencyOf))],
    [inRange]
  );

  const currency =
    currencyChoice && availableCurrencies.includes(currencyChoice)
      ? currencyChoice
      : availableCurrencies.includes('NGN')
        ? 'NGN'
        : availableCurrencies[0] ?? 'NGN';

  const scoped = useMemo(
    () => inRange.filter((inv) => currencyOf(inv) === currency),
    [inRange, currency]
  );

  const stats = useMemo(() => totalsFor(scoped), [scoped]);

  // Previous period of the same length, for the revenue change
  const revenueChange = useMemo(() => {
    if (!rangeValid) return null;
    const lengthDays = Math.round((startOfDay(range.end).getTime() - startOfDay(range.start).getTime()) / DAY_MS) + 1;
    const prevEnd = new Date(range.start.getTime() - 1);
    const prevStart = addDays(range.start, -lengthDays);

    const previous = totalsFor(
      billable.filter((inv) => {
        const issued = parseDate(inv.issueDate);
        return currencyOf(inv) === currency && issued >= prevStart && issued <= prevEnd;
      })
    );

    if (previous.billed <= 0) return null;
    return ((stats.billed - previous.billed) / previous.billed) * 100;
  }, [billable, currency, range, rangeValid, stats.billed]);

  const paidPct = stats.billed > 0 ? Math.round((stats.paid / stats.billed) * 100) : 0;
  const outstandingPct = stats.billed > 0 ? 100 - paidPct : 0;

  // Revenue chart: six buckets ending at the end of the selected period
  const buckets = useMemo(() => {
    const end = range.end;
    const result: { label: string; start: Date; end: Date; total: number }[] = [];

    for (let i = 5; i >= 0; i--) {
      if (granularity === 'monthly') {
        const start = new Date(end.getFullYear(), end.getMonth() - i, 1);
        const stop = new Date(end.getFullYear(), end.getMonth() - i + 1, 0, 23, 59, 59, 999);
        result.push({
          label: start.toLocaleDateString('en-US', { month: 'short' }),
          start,
          end: stop,
          total: 0,
        });
      } else {
        const stop = endOfDay(addDays(end, -7 * i));
        const start = startOfDay(addDays(stop, -6));
        result.push({
          label: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          start,
          end: stop,
          total: 0,
        });
      }
    }

    billable
      .filter((inv) => currencyOf(inv) === currency)
      .forEach((inv) => {
        const issued = parseDate(inv.issueDate);
        const bucket = result.find((b) => issued >= b.start && issued <= b.end);
        if (bucket) bucket.total += inv.total;
      });

    return result;
  }, [billable, currency, granularity, range.end]);

  const chartMax = Math.max(...buckets.map((b) => b.total), 0);

  // Receivables aging (as of today) for the unpaid invoices in this period
  const aging = useMemo(() => {
    const result = { current: 0, d30: 0, d60: 0, d60plus: 0 };
    const now = Date.now();

    scoped.forEach((inv) => {
      if (getDisplayStatus(inv) === 'paid') return;
      const late = Math.ceil((now - endOfDay(parseDate(inv.dueDate)).getTime()) / DAY_MS);
      if (late <= 0) result.current += inv.total;
      else if (late <= 30) result.d30 += inv.total;
      else if (late <= 60) result.d60 += inv.total;
      else result.d60plus += inv.total;
    });

    return result;
  }, [scoped]);

  const agingRows = [
    { label: 'Current', value: aging.current, bar: 'bg-emerald-500' },
    { label: '1–30 days', value: aging.d30, bar: 'bg-amber-500' },
    { label: '31–60 days', value: aging.d60, bar: 'bg-amber-500' },
    { label: '60+ days', value: aging.d60plus, bar: 'bg-red-500' },
  ];

  const topClients = useMemo(() => {
    const map = new Map<string, { name: string; total: number }>();
    scoped.forEach((inv) => {
      const entry = map.get(inv.customerId) ?? { name: inv.customerName, total: 0 };
      entry.total += inv.total;
      map.set(inv.customerId, entry);
    });
    return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 3);
  }, [scoped]);

  /* ---------- Donut ---------- */

  const RADIUS = 32;
  const CIRC = 2 * Math.PI * RADIUS;
  const donutTotal = stats.paid + stats.outstanding;
  const paidLen = donutTotal > 0 ? (stats.paid / donutTotal) * CIRC : 0;
  const outstandingLen = donutTotal > 0 ? (stats.outstanding / donutTotal) * CIRC : 0;

  /* ---------- Actions ---------- */

  const choosePeriod = (value: PeriodKey) => {
    setPeriod(value);
    setMenuOpen(false);
    trackEvent('reports_period_changed', { period: value });
  };

  const summaryText = () =>
    `${businessInfo.name}: business performance\n${rangeLabel}\n` +
    `Revenue: ${formatMoney(stats.billed, currency)}\n` +
    `Paid: ${formatMoney(stats.paid, currency)} (${paidPct}%)\n` +
    `Outstanding: ${formatMoney(stats.outstanding, currency)} (${outstandingPct}%)`;

  const handleShare = async () => {
    trackEvent('reports_share_clicked', { period });
    const text = summaryText();

    try {
      if (navigator.share) {
        await navigator.share({ title: 'Business performance', text });
        return;
      }
      await navigator.clipboard.writeText(text);
      toast.success('Report summary copied');
    } catch (error) {
      // The user closing the share sheet is not an error
      if (error instanceof DOMException && error.name === 'AbortError') return;
      toast.error('Could not share the report');
    }
  };

  const handleDownload = () => {
    trackEvent('reports_download_clicked', { period, currency });

    const rows: (string | number)[][] = [
      [businessInfo.name],
      ['Business performance'],
      ['Period', rangeLabel],
      ['Currency', currency],
      [],
      ['Summary', 'Amount'],
      ['Revenue (billed)', round2(stats.billed)],
      ['Paid', round2(stats.paid)],
      ['Outstanding', round2(stats.outstanding)],
      [],
      [granularity === 'monthly' ? 'Revenue by month' : 'Revenue by week', 'Amount'],
      ...buckets.map((b): (string | number)[] => [b.label, round2(b.total)]),
      [],
      ['Receivables aging', 'Amount'],
      ...agingRows.map((r): (string | number)[] => [r.label, round2(r.value)]),
      [],
      ['Top clients', 'Share %', 'Billed'],
      ...topClients.map((c): (string | number)[] => [
        c.name,
        stats.billed > 0 ? Math.round((c.total / stats.billed) * 100) : 0,
        round2(c.total),
      ]),
    ];

    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
    // BOM so Excel reads the currency symbol correctly
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `invoicepro-summary-${toISODate(new Date())}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    toast.success('Summary downloaded');
  };

  const handleExport = () => {
    trackEvent('reports_export_clicked', { period });
    onExport();
  };

  const handleViewDetails = () => {
    trackEvent('reports_view_details_clicked', { section: 'receivables_aging' });
    onViewDetails();
  };

  /* ---------- Render ---------- */

  return (
    <div className="min-h-screen bg-slate-50 pb-24 lg:pb-8">
      {/* Header */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 leading-tight">Reports</h2>
            <p className="text-xs text-gray-600">Business performance</p>
          </div>
          <button
            onClick={handleShare}
            aria-label="Share report"
            className="w-11 h-11 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-gray-700 transition-colors"
          >
            <Share2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 pt-5 space-y-4">
        {/* Period picker */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            className="w-full h-14 rounded-2xl border border-gray-200 bg-white px-4 flex items-center gap-3 text-left"
          >
            <CalendarDays className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="flex-1 text-[15px] font-bold text-gray-900">{rangeLabel}</span>
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </button>

          {menuOpen && (
            <>
              <button
                aria-hidden
                tabIndex={-1}
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute left-0 right-0 top-full mt-2 z-20 rounded-xl bg-white border border-gray-100 shadow-lg py-1.5">
                {PERIODS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => choosePeriod(option.value)}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-gray-700 hover:bg-slate-50"
                  >
                    {option.label}
                    {period === option.value && <Check className="w-4 h-4 text-emerald-600" />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {period === 'custom' && (
          <div>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="date"
                aria-label="Start date"
                value={customStart}
                max={customEnd || undefined}
                onChange={(e) => setCustomStart(e.target.value)}
                className={inputClass}
              />
              <input
                type="date"
                aria-label="End date"
                value={customEnd}
                min={customStart || undefined}
                onChange={(e) => setCustomEnd(e.target.value)}
                className={inputClass}
              />
            </div>
            {!rangeValid && (
              <p className="mt-1 text-xs text-red-500">Start date must be before the end date</p>
            )}
          </div>
        )}

        {/* Currency chips (only when this period has more than one currency) */}
        {availableCurrencies.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Amounts in</span>
            {availableCurrencies.map((code) => (
              <button
                key={code}
                onClick={() => setCurrencyChoice(code)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-semibold transition-colors',
                  currency === code
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-slate-50'
                )}
              >
                {code}
              </button>
            ))}
          </div>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-3.5">
            <p className="text-xs text-gray-600">Revenue</p>
            <p className="mt-1.5 text-xl font-bold text-gray-900">{compactMoney(stats.billed, currency)}</p>
            <p
              className={cn(
                'mt-1 text-xs flex items-center gap-0.5',
                revenueChange !== null && revenueChange < 0 ? 'text-red-500' : 'text-emerald-600'
              )}
            >
              {revenueChange === null ? (
                <span className="text-gray-400">No prior data</span>
              ) : (
                <>
                  {revenueChange >= 0 ? (
                    <ArrowUp className="w-3 h-3" />
                  ) : (
                    <ArrowDown className="w-3 h-3" />
                  )}
                  {Math.abs(revenueChange).toFixed(1)}%
                </>
              )}
            </p>
          </div>

          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-3.5">
            <p className="text-xs text-gray-600">Paid</p>
            <p className="mt-1.5 text-xl font-bold text-gray-900">{compactMoney(stats.paid, currency)}</p>
            <p className="mt-1 text-xs text-emerald-600">{paidPct}%</p>
          </div>

          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-3.5">
            <p className="text-xs text-gray-600">Outstanding</p>
            <p className="mt-1.5 text-xl font-bold text-gray-900">
              {compactMoney(stats.outstanding, currency)}
            </p>
            <p className="mt-1 text-xs text-emerald-600">{outstandingPct}%</p>
          </div>
        </div>

        {/* Revenue chart */}
        <section className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-gray-900">Revenue</h3>
            <button
              onClick={() => {
                const next = granularity === 'monthly' ? 'weekly' : 'monthly';
                setGranularity(next);
                trackEvent('reports_chart_granularity_changed', { value: next });
              }}
              aria-label={`Switch to ${granularity === 'monthly' ? 'weekly' : 'monthly'} view`}
              className="text-sm font-bold text-emerald-700 hover:text-emerald-800"
            >
              {granularity === 'monthly' ? 'Monthly' : 'Weekly'}
            </button>
          </div>

          {chartMax === 0 && (
            <p className="mt-3 text-xs text-gray-400">No revenue recorded in these periods yet.</p>
          )}

          <div className="mt-5 flex items-end gap-3 h-52">
            {buckets.map((bucket, index) => {
              const pct = chartMax > 0 ? (bucket.total / chartMax) * 100 : 0;
              const isLast = index === buckets.length - 1;

              return (
                <div key={`${bucket.label}-${index}`} className="flex-1 h-full flex flex-col items-center gap-2">
                  <div className="flex-1 min-h-0 w-full flex items-end justify-center">
                    <div
                      title={`${bucket.label}: ${formatMoney(bucket.total, currency)}`}
                      className={cn(
                        'w-full max-w-[34px] rounded-t-lg transition-all',
                        isLast ? 'bg-emerald-500' : 'bg-emerald-200'
                      )}
                      style={{ height: `${Math.max(pct, 3)}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-gray-400">{bucket.label}</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Paid vs outstanding */}
        <section className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
          <h3 className="text-xl font-bold text-gray-900">Paid vs outstanding</h3>

          <div className="mt-5 flex items-center gap-6">
            <div className="relative w-[112px] h-[112px] shrink-0">
              <svg viewBox="0 0 112 112" className="w-full h-full" role="img" aria-label="Paid versus outstanding">
                <circle cx="56" cy="56" r="55" fill="#ecfdf5" />
                <circle cx="56" cy="56" r={RADIUS} fill="none" stroke="#e2e8f0" strokeWidth="20" />
                {paidLen > 0 && (
                  <circle
                    cx="56"
                    cy="56"
                    r={RADIUS}
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="20"
                    strokeDasharray={`${paidLen} ${CIRC - paidLen}`}
                    transform="rotate(-90 56 56)"
                  />
                )}
                {outstandingLen > 0 && (
                  <circle
                    cx="56"
                    cy="56"
                    r={RADIUS}
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="20"
                    strokeDasharray={`${outstandingLen} ${CIRC - outstandingLen}`}
                    strokeDashoffset={-paidLen}
                    transform="rotate(-90 56 56)"
                  />
                )}
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-base font-bold text-gray-900">
                {paidPct}%
              </span>
            </div>

            <ul className="flex-1 space-y-3 text-sm">
              <li className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-gray-700">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Paid
                </span>
                <span className="font-bold text-gray-900">{formatMoney(stats.paid, currency)}</span>
              </li>
              <li className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-gray-700">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Outstanding
                </span>
                <span className="font-bold text-gray-900">{formatMoney(stats.outstanding, currency)}</span>
              </li>
            </ul>
          </div>
        </section>

        {/* Receivables aging */}
        <section className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-gray-900">Receivables aging</h3>
            <button
              onClick={handleViewDetails}
              className="text-sm font-bold text-emerald-700 hover:text-emerald-800"
            >
              View details
            </button>
          </div>

          <ul className="mt-5 space-y-4">
            {agingRows.map((row) => {
              const width = stats.outstanding > 0 ? (row.value / stats.outstanding) * 100 : 0;
              return (
                <li key={row.label} className="flex items-center gap-4">
                  <span className="w-[84px] shrink-0 text-sm text-gray-700">{row.label}</span>
                  <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all', row.bar)}
                      style={{ width: `${row.value > 0 ? Math.max(width, 3) : 0}%` }}
                    />
                  </div>
                  <span className="w-[72px] shrink-0 text-right text-sm font-bold text-gray-900">
                    {formatMoney(row.value, currency)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Top clients */}
        <section className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
          <h3 className="text-xl font-bold text-gray-900">Top clients</h3>

          {topClients.length === 0 ? (
            <p className="mt-4 text-sm text-gray-400">No client activity in this period.</p>
          ) : (
            <ul className="mt-4 space-y-4">
              {topClients.map((client, index) => {
                const share = stats.billed > 0 ? Math.round((client.total / stats.billed) * 100) : 0;
                return (
                  <li key={`${client.name}-${index}`} className="flex items-center gap-3">
                    <span className="w-8 h-8 shrink-0 rounded-full bg-slate-100 text-sm font-semibold text-gray-600 flex items-center justify-center">
                      {index + 1}
                    </span>
                    <span className="flex-1 min-w-0 text-[15px] font-bold text-gray-900 truncate">
                      {client.name}
                    </span>
                    <span className="text-sm text-gray-500">{share}%</span>
                    <span className="w-[72px] text-right text-sm font-bold text-gray-900">
                      {formatMoney(client.total, currency)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Actions */}
        <div className="grid grid-cols-3 gap-3 pt-1">
          <button
            onClick={handleShare}
            className="h-12 rounded-xl border-2 border-emerald-600 bg-white text-sm font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors"
          >
            Share
          </button>
          <button
            onClick={handleDownload}
            className="h-12 rounded-xl border-2 border-emerald-600 bg-white text-sm font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors"
          >
            Download
          </button>
          <button
            onClick={handleExport}
            className="h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold text-white transition-colors"
          >
            Export
          </button>
        </div>
      </div>
    </div>
  );
}