import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronLeft, ChevronDown, FileText, Table, Mail, Info, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { Invoice, Customer, BusinessInfo } from '@/types';
import { cn } from '@/lib/utils';
import { trackEvent } from '@/utils/analytics';
import { getBrand } from '@/sections/BusinessBranding';

interface ExportReportProps {
  invoices: Invoice[];
  customers: Customer[];
  businessInfo: BusinessInfo;
  onBack: () => void;
}

/* ---------- Types & constants ---------- */

type ReportType = 'revenue' | 'invoices' | 'outstanding' | 'clients';
type Format = 'pdf' | 'csv' | 'xlsx';
type Destination = 'download' | 'email';
type DisplayStatus = 'draft' | 'unpaid' | 'paid' | 'overdue';

interface Cell {
  text: string;
  value: string | number;
  align?: 'right';
}

interface ReportTable {
  headers: string[];
  rows: Cell[][];
}

interface CurrencySummary {
  currency: string;
  billed: number;
  collected: number;
  outstanding: number;
  overdue: number;
}

const REPORT_TYPES: { value: ReportType; label: string }[] = [
  { value: 'revenue', label: 'Revenue & payments' },
  { value: 'invoices', label: 'Invoice list' },
  { value: 'outstanding', label: 'Outstanding & overdue' },
  { value: 'clients', label: 'Client summary' },
];

const STATUS_OPTIONS: { value: 'all' | DisplayStatus; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'paid', label: 'Paid' },
  { value: 'unpaid', label: 'Pending' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'draft', label: 'Draft' },
];

const STATUS_LABEL: Record<DisplayStatus, string> = {
  draft: 'Draft',
  unpaid: 'Pending',
  paid: 'Paid',
  overdue: 'Overdue',
};

const FORMATS: { value: Format; label: string; icon: typeof FileText }[] = [
  { value: 'pdf', label: 'PDF', icon: FileText },
  { value: 'csv', label: 'CSV', icon: Table },
  { value: 'xlsx', label: 'XLSX', icon: Table },
];

const DAY_MS = 86400000;

/* ---------- Helpers ---------- */

const toISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const parseDate = (value: string) =>
  value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);

const endOfDay = (value: string) => {
  const d = parseDate(value);
  d.setHours(23, 59, 59, 999);
  return d;
};

const fmtDate = (value: string) =>
  parseDate(value).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });

const formatMoney = (amount: number, currency: string) =>
  new Intl.NumberFormat(currency === 'NGN' ? 'en-NG' : 'en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Always show overdue correctly if the due date has passed */
const getDisplayStatus = (invoice: Invoice): DisplayStatus => {
  const status = invoice.status as string;
  if (status === 'paid') return 'paid';
  if (status === 'draft') return 'draft';
  if (endOfDay(invoice.dueDate) < new Date()) return 'overdue';
  return 'unpaid';
};

const daysOverdue = (invoice: Invoice) =>
  Math.max(0, Math.ceil((Date.now() - endOfDay(invoice.dueDate).getTime()) / DAY_MS));

const currencyOf = (invoice: Invoice) => invoice.currency ?? 'NGN';

// Cell builders
const txt = (s: string): Cell => ({ text: s, value: s });
const dateCell = (v: string): Cell => ({ text: fmtDate(v), value: toISODate(parseDate(v)) });
const moneyCell = (n: number, cur: string): Cell => ({
  text: formatMoney(n, cur),
  value: Math.round(n * 100) / 100,
  align: 'right',
});
const intCell = (n: number): Cell => ({ text: String(n), value: n, align: 'right' });

const buildTable = (type: ReportType, list: Invoice[]): ReportTable => {
  switch (type) {
    case 'invoices':
      return {
        headers: ['Invoice', 'Client', 'Issued', 'Due', 'Status', 'Currency', 'Subtotal', 'Discount', 'Tax', 'Total'],
        rows: [...list]
          .sort((a, b) => parseDate(b.issueDate).getTime() - parseDate(a.issueDate).getTime())
          .map((inv) => {
            const cur = currencyOf(inv);
            return [
              txt(inv.invoiceNumber),
              txt(inv.customerName),
              dateCell(inv.issueDate),
              dateCell(inv.dueDate),
              txt(STATUS_LABEL[getDisplayStatus(inv)]),
              txt(cur),
              moneyCell(inv.subtotal, cur),
              moneyCell(inv.discount ?? 0, cur),
              moneyCell(inv.tax, cur),
              moneyCell(inv.total, cur),
            ];
          }),
      };

    case 'outstanding':
      return {
        headers: ['Invoice', 'Client', 'Issued', 'Due', 'Days overdue', 'Status', 'Currency', 'Amount due'],
        rows: [...list]
          .sort((a, b) => parseDate(a.dueDate).getTime() - parseDate(b.dueDate).getTime())
          .map((inv) => {
            const cur = currencyOf(inv);
            const status = getDisplayStatus(inv);
            return [
              txt(inv.invoiceNumber),
              txt(inv.customerName),
              dateCell(inv.issueDate),
              dateCell(inv.dueDate),
              intCell(status === 'overdue' ? daysOverdue(inv) : 0),
              txt(STATUS_LABEL[status]),
              txt(cur),
              moneyCell(inv.total, cur),
            ];
          }),
      };

    case 'clients': {
      const groups = new Map<
        string,
        { name: string; cur: string; count: number; billed: number; paid: number; outstanding: number }
      >();

      list.forEach((inv) => {
        const cur = currencyOf(inv);
        const key = `${inv.customerId}|${cur}`;
        const g = groups.get(key) ?? {
          name: inv.customerName,
          cur,
          count: 0,
          billed: 0,
          paid: 0,
          outstanding: 0,
        };
        const status = getDisplayStatus(inv);
        g.count += 1;
        g.billed += inv.total;
        if (status === 'paid') g.paid += inv.total;
        if (status === 'unpaid' || status === 'overdue') g.outstanding += inv.total;
        groups.set(key, g);
      });

      return {
        headers: ['Client', 'Invoices', 'Currency', 'Billed', 'Paid', 'Outstanding'],
        rows: [...groups.values()]
          .sort((a, b) => b.billed - a.billed)
          .map((g) => [
            txt(g.name),
            intCell(g.count),
            txt(g.cur),
            moneyCell(g.billed, g.cur),
            moneyCell(g.paid, g.cur),
            moneyCell(g.outstanding, g.cur),
          ]),
      };
    }

    default:
      return {
        headers: ['Invoice', 'Client', 'Issued', 'Status', 'Paid on', 'Currency', 'Amount'],
        rows: [...list]
          .sort((a, b) => parseDate(b.issueDate).getTime() - parseDate(a.issueDate).getTime())
          .map((inv) => {
            const cur = currencyOf(inv);
            return [
              txt(inv.invoiceNumber),
              txt(inv.customerName),
              dateCell(inv.issueDate),
              txt(STATUS_LABEL[getDisplayStatus(inv)]),
              inv.paidAt ? dateCell(inv.paidAt) : txt('-'),
              txt(cur),
              moneyCell(inv.total, cur),
            ];
          }),
      };
  }
};

const summarize = (list: Invoice[]): CurrencySummary[] => {
  const map = new Map<string, CurrencySummary>();
  list.forEach((inv) => {
    const currency = currencyOf(inv);
    const s = map.get(currency) ?? { currency, billed: 0, collected: 0, outstanding: 0, overdue: 0 };
    const status = getDisplayStatus(inv);
    s.billed += inv.total;
    if (status === 'paid') s.collected += inv.total;
    if (status === 'unpaid' || status === 'overdue') s.outstanding += inv.total;
    if (status === 'overdue') s.overdue += inv.total;
    map.set(currency, s);
  });
  return [...map.values()];
};

/** CSV cell with quoting, plus protection against spreadsheet formula injection in text */
const csvCell = (value: string | number) => {
  if (typeof value === 'number') return String(value);
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
};

const estimateBytes = (format: Format, rows: number) =>
  format === 'pdf' ? 45_000 + rows * 1_800 : format === 'csv' ? 200 + rows * 140 : 9_000 + rows * 160;

const formatSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/* ---------- Small UI helpers (outside the component) ---------- */

const inputClass =
  'w-full h-12 rounded-xl border border-gray-300 bg-white px-3.5 text-[15px] text-gray-900 outline-none placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition';

function Field({ label, children, error }: { label: string; children: ReactNode; error?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1.5">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

function SelectField({
  value,
  onChange,
  children,
  chevron = true,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  chevron?: boolean;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(inputClass, 'appearance-none', chevron && 'pr-9')}
      >
        {children}
      </select>
      {chevron && (
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
      )}
    </div>
  );
}

function Radio({ checked, label, onSelect }: { checked: boolean; label: string; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className="flex items-center gap-3 py-1 text-left"
    >
      <span
        className={cn(
          'w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors',
          checked ? 'border-emerald-500 bg-emerald-500' : 'border-gray-300 bg-white'
        )}
      >
        {checked && <span className="w-2 h-2 rounded-full bg-white" />}
      </span>
      <span className={cn('text-[15px]', checked ? 'font-bold text-gray-900' : 'text-gray-700')}>
        {label}
      </span>
    </button>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative w-12 h-7 rounded-full transition-colors shrink-0',
        checked ? 'bg-emerald-600' : 'bg-gray-300'
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform',
          checked && 'translate-x-5'
        )}
      />
    </button>
  );
}

/* ---------- Component ---------- */

export function ExportReport({ invoices, customers, businessInfo, onBack }: ExportReportProps) {
  const today = new Date();
  const [reportType, setReportType] = useState<ReportType>('revenue');
  const [startDate, setStartDate] = useState(toISODate(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [endDate, setEndDate] = useState(toISODate(today));
  const [status, setStatus] = useState<'all' | DisplayStatus>('all');
  const [clientId, setClientId] = useState('all');
  const [format, setFormat] = useState<Format>('pdf');
  const [destination, setDestination] = useState<Destination>('download');
  const [email, setEmail] = useState(businessInfo.email ?? '');
  const [shareSheet, setShareSheet] = useState(false);
  const [busy, setBusy] = useState(false);

  const brand = getBrand(businessInfo.brandColor);
  const reportLabel = REPORT_TYPES.find((t) => t.value === reportType)?.label ?? 'Report';
  const statusLabel = STATUS_OPTIONS.find((s) => s.value === status)?.label ?? 'All statuses';
  const clientLabel =
    clientId === 'all' ? 'All clients' : customers.find((c) => c.id === clientId)?.name ?? 'Selected client';

  /* ---------- Derived data ---------- */

  const dateError =
    !startDate || !endDate
      ? 'Choose a start and end date'
      : parseDate(startDate) > parseDate(endDate)
        ? 'Start date must be before the end date'
        : '';

  const emailError = destination === 'email' && !isEmail(email.trim()) ? 'Enter a valid email address' : '';

  const scoped = useMemo(() => {
    if (dateError) return [];
    const start = parseDate(startDate);
    const end = endOfDay(endDate);

    return invoices.filter((inv) => {
      const issued = parseDate(inv.issueDate);
      if (issued < start || issued > end) return false;

      const displayStatus = getDisplayStatus(inv);
      if (status !== 'all' && displayStatus !== status) return false;
      if (clientId !== 'all' && inv.customerId !== clientId) return false;
      if (reportType === 'outstanding' && displayStatus !== 'unpaid' && displayStatus !== 'overdue') {
        return false;
      }
      return true;
    });
  }, [invoices, startDate, endDate, status, clientId, reportType, dateError]);

  const paymentsCount = scoped.filter((inv) => getDisplayStatus(inv) === 'paid').length;
  const rowCount = reportType === 'clients' ? new Set(scoped.map((i) => i.customerId)).size : scoped.length;
  const sizeText = formatSize(estimateBytes(format, rowCount));
  const canGenerate = !dateError && !emailError && scoped.length > 0 && !busy;

  /* ---------- Export builders ---------- */

  const buildCsv = (table: ReportTable) => {
    const lines = [
      table.headers.map(csvCell).join(','),
      ...table.rows.map((row) => row.map((cell) => csvCell(cell.value)).join(',')),
    ];
    // BOM so Excel reads ₦ and accents correctly
    return new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  };

  const buildXlsx = async (table: ReportTable, summaries: CurrencySummary[]) => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();

    const reportSheet = XLSX.utils.aoa_to_sheet([
      table.headers,
      ...table.rows.map((row) => row.map((cell) => cell.value)),
    ]);
    reportSheet['!cols'] = table.headers.map((h, i) => ({
      wch: Math.max(h.length, ...table.rows.slice(0, 200).map((r) => String(r[i].value).length)) + 2,
    }));
    XLSX.utils.book_append_sheet(wb, reportSheet, 'Report');

    const summarySheet = XLSX.utils.aoa_to_sheet([
      [businessInfo.name],
      [reportLabel],
      [`Period: ${fmtDate(startDate)} to ${fmtDate(endDate)}`],
      [`Status: ${statusLabel}`, `Client: ${clientLabel}`],
      [],
      ['Currency', 'Billed', 'Collected', 'Outstanding', 'Overdue'],
      ...summaries.map((s) => [s.currency, s.billed, s.collected, s.outstanding, s.overdue]),
    ]);
    summarySheet['!cols'] = [{ wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return new Blob([out], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  };

  const writePdfWindow = (w: Window, table: ReportTable, summaries: CurrencySummary[]) => {
    const logo = businessInfo.logo
      ? `<img src="${escapeHtml(businessInfo.logo)}" alt="" style="width:52px;height:52px;object-fit:contain" />`
      : '';

    const summaryRows = summaries
      .map(
        (s) => `<tr>
          <td>${escapeHtml(s.currency)}</td>
          <td class="r">${formatMoney(s.billed, s.currency)}</td>
          <td class="r">${formatMoney(s.collected, s.currency)}</td>
          <td class="r">${formatMoney(s.outstanding, s.currency)}</td>
          <td class="r">${formatMoney(s.overdue, s.currency)}</td>
        </tr>`
      )
      .join('');

    const head = table.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
    const body = table.rows
      .map(
        (row) =>
          `<tr>${row
            .map((cell) => `<td class="${cell.align === 'right' ? 'r' : ''}">${escapeHtml(cell.text)}</td>`)
            .join('')}</tr>`
      )
      .join('');

    w.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(reportLabel)} ${startDate} to ${endDate}</title>
  <style>
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111827; margin: 32px; font-size: 12px; }
    .top { display: flex; justify-content: space-between; align-items: flex-start; }
    h1 { font-size: 22px; margin: 18px 0 2px; color: ${brand.text}; }
    .muted { color: #6b7280; }
    h2 { font-size: 13px; margin: 22px 0 6px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 10px; letter-spacing: .05em; text-transform: uppercase; color: #6b7280; padding: 6px 6px; border-bottom: 2px solid ${brand.value}; background: ${brand.value}14; }
    td { padding: 6px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
    .r { text-align: right; white-space: nowrap; }
    .foot { margin-top: 24px; font-size: 10px; color: #9ca3af; text-align: center; }
    @media print { body { margin: 14px; } }
  </style>
</head>
<body>
  <div class="top">
    <div>
      <strong style="font-size:16px">${escapeHtml(businessInfo.name)}</strong>
      <div class="muted">Generated ${fmtDate(new Date().toISOString())}</div>
    </div>
    ${logo}
  </div>

  <h1>${escapeHtml(reportLabel)}</h1>
  <div class="muted">
    ${fmtDate(startDate)} to ${fmtDate(endDate)} · ${escapeHtml(statusLabel)} · ${escapeHtml(clientLabel)}
  </div>

  <h2>Summary</h2>
  <table>
    <thead><tr><th>Currency</th><th class="r">Billed</th><th class="r">Collected</th><th class="r">Outstanding</th><th class="r">Overdue</th></tr></thead>
    <tbody>${summaryRows}</tbody>
  </table>

  <h2>Details (${table.rows.length} row${table.rows.length === 1 ? '' : 's'})</h2>
  <table>
    <thead><tr>${head}</tr></thead>
    <tbody>${body}</tbody>
  </table>

  <div class="foot">Created with InvoicePro NG</div>
</body>
</html>`);
    w.document.close();
    w.focus();
    // Give the browser a moment to lay the page out, then open Print (choose "Save as PDF")
    setTimeout(() => w.print(), 300);
  };

  /* ---------- Generate ---------- */

  const handleGenerate = async () => {
    if (!canGenerate) return;

    // The print window must be opened directly from the click, before any await
    let printWindow: Window | null = null;
    if (format === 'pdf') {
      printWindow = window.open('', '_blank');
      if (!printWindow) {
        toast.error('Please allow pop-ups to create the PDF');
        return;
      }
    }

    setBusy(true);
    trackEvent('report_export_started', {
      report_type: reportType,
      format,
      destination,
      rows: rowCount,
      share_sheet: shareSheet,
    });

    try {
      const table = buildTable(reportType, scoped);
      const summaries = summarize(scoped);
      const filename = `invoicepro-${reportType}-${startDate}_to_${endDate}.${format}`;
      let file: File | null = null;

      if (format === 'pdf' && printWindow) {
        writePdfWindow(printWindow, table, summaries);
      } else {
        const blob = format === 'csv' ? buildCsv(table) : await buildXlsx(table, summaries);
        downloadBlob(blob, filename);
        file = new File([blob], filename, { type: blob.type });
      }

      const summaryText =
        `${reportLabel}: ${fmtDate(startDate)} to ${fmtDate(endDate)}\n` +
        summaries
          .map(
            (s) =>
              `${s.currency}: billed ${formatMoney(s.billed, s.currency)}, collected ${formatMoney(s.collected, s.currency)}, outstanding ${formatMoney(s.outstanding, s.currency)}`
          )
          .join('\n');

      // Email: a mailto link can't attach files, so the user attaches the exported file themselves
      if (destination === 'email') {
        const subject = encodeURIComponent(`${businessInfo.name} report: ${reportLabel}`);
        const body = encodeURIComponent(
          `Hello,\n\n${summaryText}\n\n` +
            (format === 'pdf'
              ? 'Please attach the PDF you just saved.\n\n'
              : `Please attach the file: ${filename}\n\n`) +
            businessInfo.name
        );
        window.open(`mailto:${encodeURIComponent(email.trim())}?subject=${subject}&body=${body}`, '_self');
      }

      // Share sheet: files when the device supports it, otherwise the text summary
      if (shareSheet && typeof navigator.share === 'function') {
        try {
          if (file && navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], title: reportLabel });
          } else {
            await navigator.share({ title: reportLabel, text: summaryText });
          }
        } catch (error) {
          if (!(error instanceof DOMException && error.name === 'AbortError')) {
            toast.error('Could not open the share sheet');
          }
        }
      } else if (shareSheet) {
        toast.info('Sharing is not supported on this device');
      }

      trackEvent('report_exported', {
        report_type: reportType,
        format,
        destination,
        rows: table.rows.length,
        share_sheet: shareSheet,
      });

      toast.success(
        format === 'pdf'
          ? 'Choose "Save as PDF" in the print window'
          : destination === 'email'
            ? 'Report saved. Attach it in your email app.'
            : 'Report downloaded'
      );
    } catch {
      trackEvent('report_export_failed', { report_type: reportType, format });
      printWindow?.close();
      toast.error('Could not create the report. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  /* ---------- Render ---------- */

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-xl mx-auto px-4 h-16 flex items-center gap-3">
          <button
            onClick={onBack}
            aria-label="Back"
            className="w-10 h-10 rounded-full bg-slate-50 border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-base font-bold text-gray-900 leading-tight">Export report</h2>
            <p className="text-xs text-gray-500">Build a custom report</p>
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto p-4 space-y-4">
        {/* Filters */}
        <section className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4 space-y-4">
          <Field label="Report Type">
            <SelectField value={reportType} onChange={(v) => setReportType(v as ReportType)}>
              {REPORT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </SelectField>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Start Date">
              <input
                type="date"
                value={startDate}
                max={endDate || undefined}
                onChange={(e) => setStartDate(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="End Date">
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
          {dateError && <p className="-mt-2 text-xs text-red-500">{dateError}</p>}

          <Field label="Status filter">
            <SelectField value={status} onChange={(v) => setStatus(v as 'all' | DisplayStatus)} chevron={false}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </SelectField>
          </Field>

          <Field label="Client filter">
            <SelectField value={clientId} onChange={setClientId} chevron={false}>
              <option value="all">All clients</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
          </Field>
        </section>

        {/* Format */}
        <div>
          <p className="px-0.5 mb-2 text-xs font-semibold text-gray-600">Export format</p>
          <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Export format">
            {FORMATS.map((f) => {
              const Icon = f.icon;
              const selected = format === f.value;
              return (
                <button
                  key={f.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setFormat(f.value)}
                  className={cn(
                    'h-[68px] rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-colors',
                    selected
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700 font-bold'
                      : 'border-gray-200 bg-white text-gray-700 font-semibold hover:bg-slate-50'
                  )}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-xs">{f.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Destination */}
        <section className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4">
          <h3 className="text-lg font-bold text-gray-900 mb-3">Destination</h3>

          <div role="radiogroup" aria-label="Destination" className="space-y-3">
            <Radio
              checked={destination === 'download'}
              label="Download to this device"
              onSelect={() => setDestination('download')}
            />
            <div className="border-t border-gray-100" />
            <Radio
              checked={destination === 'email'}
              label="Email report to"
              onSelect={() => setDestination('email')}
            />
          </div>

          {destination === 'email' && (
            <div className="mt-3">
              <Field label="Email destination" error={emailError}>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="email"
                    inputMode="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className={cn(inputClass, 'pl-10', emailError && 'border-red-400')}
                  />
                </div>
              </Field>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-gray-900">Also open share sheet</p>
              <p className="text-[11px] text-gray-500">Share with another app after export</p>
            </div>
            <Toggle checked={shareSheet} onChange={setShareSheet} label="Also open share sheet" />
          </div>
        </section>

        {/* Info */}
        <div className="flex items-start gap-3 rounded-xl bg-blue-50 border border-blue-100 px-4 py-3">
          <Info className="w-4 h-4 mt-0.5 text-blue-500 shrink-0" />
          <p className="text-sm text-blue-900">
            Your report contains {scoped.length} invoice{scoped.length === 1 ? '' : 's'} and {paymentsCount}{' '}
            payment{paymentsCount === 1 ? '' : 's'}. Estimated size: {sizeText}.
          </p>
        </div>

        {/* Generate */}
        <button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="w-full h-14 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-base font-semibold text-white transition-colors disabled:opacity-50 disabled:hover:bg-emerald-600"
        >
          {busy ? 'Generating...' : `Generate ${format.toUpperCase()} report`}
        </button>

        {/* Status */}
        {canGenerate || busy ? (
          <div className="flex items-start gap-3 rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3">
            <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0" />
            <div>
              <p className="text-sm font-bold text-emerald-800">Ready to export</p>
              <p className="text-xs text-emerald-700">Filters and format are complete.</p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
            <AlertCircle className="w-4 h-4 mt-0.5 text-amber-600 shrink-0" />
            <div>
              <p className="text-sm font-bold text-amber-800">Nothing to export yet</p>
              <p className="text-xs text-amber-700">
                {dateError || emailError || 'No invoices match these filters. Try a wider date range.'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}