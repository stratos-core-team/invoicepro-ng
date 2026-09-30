import { useState } from 'react';
import { ChevronLeft, Share2, Mail, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import type { Invoice, BusinessInfo } from '@/types';
import { cn } from '@/lib/utils';
import { trackEvent } from '@/utils/analytics';
import { EVENTS } from '@/analytics/events';

export interface SendOptions {
  recipient: string;
  cc: string;
  attachPdf: boolean;
  readReceipt: boolean;
}

interface PreviewSendProps {
  invoice: Invoice;
  businessInfo: BusinessInfo;
  onBack: () => void;
  onSend: (invoice: Invoice, options: SendOptions) => void;
}

/* ---------- Helpers ---------- */

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const parseDate = (value: string) =>
  value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);

const formatDate = (value: string) =>
  parseDate(value).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

const makeMoney = (currency: string) => (amount: number) =>
  new Intl.NumberFormat(currency === 'NGN' ? 'en-NG' : 'en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);

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

export function PreviewSend({ invoice, businessInfo, onBack, onSend }: PreviewSendProps) {
  const [recipient, setRecipient] = useState(invoice.customerEmail ?? '');
  const [cc, setCc] = useState('');
  const [attachPdf, setAttachPdf] = useState(true);
  const [readReceipt, setReadReceipt] = useState(true);
  const [recipientError, setRecipientError] = useState('');
  const [ccError, setCcError] = useState('');

  const currency = invoice.currency ?? 'NGN';
  const money = makeMoney(currency);
  const discountAmount = invoice.discount ?? 0;

  const businessInitials =
    businessInfo.name
      .split(' ')
      .filter(Boolean)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'IP';

  const businessLine = [businessInfo.address, businessInfo.email].filter(Boolean).join(' · ');
  const billToLine = [invoice.customerAddress, invoice.customerEmail].filter(Boolean).join(' · ');
  const footerNote =
    invoice.notes?.trim() ||
    `Thank you for your business. Payment terms: ${invoice.paymentTerms}.`;

  /* ---------- Actions ---------- */

  const summaryText = () =>
    `Invoice ${invoice.invoiceNumber} from ${businessInfo.name}\n` +
    `Bill to: ${invoice.customerName}\n` +
    `Total due: ${money(invoice.total)}\n` +
    `Due date: ${formatDate(invoice.dueDate)}`;

  const handleShare = async () => {
    const text = summaryText();
    trackEvent('invoice_share_clicked', { from_view: 'preview_send' });

    try {
      if (navigator.share) {
        await navigator.share({ title: `Invoice ${invoice.invoiceNumber}`, text });
        return;
      }
      await navigator.clipboard.writeText(text);
      toast.success('Invoice summary copied');
    } catch (error) {
      // The user closing the share sheet is not an error
      if (error instanceof DOMException && error.name === 'AbortError') return;
      toast.error('Could not share this invoice');
    }
  };

  const handleDownloadPdf = () => {
    trackEvent('invoice_pdf_download_clicked', { from_view: 'preview_send' });

    const w = window.open('', '_blank');
    if (!w) {
      toast.error('Please allow pop-ups to download the PDF');
      return;
    }

    const rows = invoice.items
      .map(
        (item) => `
        <tr>
          <td>
            ${escapeHtml(item.description)}
            ${item.details ? `<div class="sub">${escapeHtml(item.details)}</div>` : ''}
            ${item.quantity > 1 ? `<div class="sub">${item.quantity} × ${money(item.unitPrice)}</div>` : ''}
          </td>
          <td class="right">${money(item.total)}</td>
        </tr>`
      )
      .join('');

    w.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(invoice.invoiceNumber)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111827; margin: 40px; }
    .top { display: flex; justify-content: space-between; align-items: flex-start; }
    h1 { font-size: 32px; margin: 32px 0 4px; }
    .muted { color: #6b7280; font-size: 13px; }
    .label { font-size: 11px; letter-spacing: .08em; color: #9ca3af; margin-top: 28px; }
    table { width: 100%; border-collapse: collapse; margin-top: 24px; }
    th { text-align: left; font-size: 11px; color: #9ca3af; letter-spacing: .06em; padding-bottom: 8px; border-bottom: 1px solid #e5e7eb; }
    td { padding: 10px 0; font-size: 14px; vertical-align: top; }
    .right { text-align: right; }
    .sub { font-size: 12px; color: #6b7280; margin-top: 2px; }
    .totals { margin-top: 16px; margin-left: auto; width: 260px; font-size: 14px; }
    .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
    .due { background: #ecfdf5; color: #065f46; font-weight: bold; font-size: 18px; padding: 12px; border-radius: 8px; margin-top: 8px; }
    .note { margin-top: 32px; font-size: 12px; color: #6b7280; text-align: center; }
    @media print { body { margin: 20px; } }
  </style>
</head>
<body>
  <div class="top">
    <div>
      <strong style="font-size:18px">${escapeHtml(businessInfo.name)}</strong>
      <div class="muted">${escapeHtml(businessLine)}</div>
    </div>
    <div class="muted right">
      Issued ${formatDate(invoice.issueDate)}<br />
      Due ${formatDate(invoice.dueDate)}
    </div>
  </div>

  <h1>INVOICE</h1>
  <div class="muted">${escapeHtml(invoice.invoiceNumber)}</div>

  <div class="label">BILL TO</div>
  <strong>${escapeHtml(invoice.customerName)}</strong>
  <div class="muted">${escapeHtml(billToLine)}</div>

  <table>
    <thead><tr><th>ITEM</th><th class="right">AMOUNT</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="totals">
    <div><span>Subtotal</span><span>${money(invoice.subtotal)}</span></div>
    ${discountAmount > 0 ? `<div><span>Discount</span><span>- ${money(discountAmount)}</span></div>` : ''}
    <div><span>Tax</span><span>${money(invoice.tax)}</span></div>
    <div class="due"><span>Total due</span><span>${money(invoice.total)}</span></div>
  </div>

  <div class="note">${escapeHtml(footerNote)}</div>
</body>
</html>`);
    w.document.close();
    w.focus();
    // Give the browser a moment to lay the page out, then open Print (choose "Save as PDF")
    setTimeout(() => w.print(), 300);
  };

  const buildMailto = (to: string, ccList: string[]) => {
    const lines = invoice.items.map((it) => `- ${it.description}: ${money(it.total)}`);
    const body =
      `Hello ${invoice.customerName},\n\n` +
      `Please find invoice ${invoice.invoiceNumber} from ${businessInfo.name}.\n\n` +
      `${lines.join('\n')}\n\n` +
      `Total due: ${money(invoice.total)}\n` +
      `Due date: ${formatDate(invoice.dueDate)}\n\n` +
      `${footerNote}\n\n` +
      `Thank you,\n${businessInfo.name}`;

    const params = [
      ccList.length ? `cc=${encodeURIComponent(ccList.join(','))}` : '',
      `subject=${encodeURIComponent(`Invoice ${invoice.invoiceNumber} from ${businessInfo.name}`)}`,
      `body=${encodeURIComponent(body)}`,
    ].filter(Boolean);

    return `mailto:${encodeURIComponent(to)}?${params.join('&')}`;
  };

  const handleSend = () => {
    setRecipientError('');
    setCcError('');

    const to = recipient.trim();
    if (!isEmail(to)) {
      setRecipientError('Enter a valid email address');
      trackEvent(EVENTS.INVOICE_CREATION_FAILED, { reason: 'invalid_recipient_email' });
      toast.error('Enter a valid recipient email');
      return;
    }

    const ccList = cc.split(/[,;\s]+/).filter(Boolean);
    if (ccList.some((email) => !isEmail(email))) {
      setCcError('Check the CC email address');
      trackEvent(EVENTS.INVOICE_CREATION_FAILED, { reason: 'invalid_cc_email' });
      toast.error('Check the CC email address');
      return;
    }

    // PostHog event (moved here from the create page, because this is where the invoice is now created)
    trackEvent(EVENTS.INVOICE_CREATED, {
      invoice_id: invoice.id,
      invoice_number: invoice.invoiceNumber,
      customer_id: invoice.customerId,
      items_count: invoice.items.length,
      amount: invoice.total,
      currency,
      status: invoice.status,
      payment_terms: invoice.paymentTerms,
      discount_percent: invoice.discountPercent ?? 0,
      tax_rate: invoice.taxRate,
      recurring: invoice.recurring ?? false,
      attach_pdf: attachPdf,
      read_receipt: readReceipt,
      cc_count: ccList.length,
      sent_via: 'mailto',
    });

    // Keep GA event too
    if (window.gtag) {
      window.gtag('event', 'invoice_created', {
        value: invoice.total,
        currency,
      });
    }

    // Open the user's email app with the message ready, then save the invoice
    window.open(buildMailto(to, ccList), '_self');
    onSend(invoice, { recipient: to, cc, attachPdf, readReceipt });
    toast.success('Invoice saved. Your email app is ready to send it.');
  };

  /* ---------- Render ---------- */

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              aria-label="Back to edit"
              className="w-10 h-10 rounded-full bg-slate-50 border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-base font-bold text-gray-900 leading-tight">Preview &amp; send</h2>
              <p className="text-xs text-gray-500">{invoice.invoiceNumber}</p>
            </div>
          </div>
          <button
            onClick={handleShare}
            aria-label="Share"
            className="w-10 h-10 rounded-full bg-slate-50 border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <Share2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="max-w-xl mx-auto p-4 space-y-4">
        {/* Invoice preview */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-gray-900 truncate">{businessInfo.name}</h3>
              {businessLine && <p className="text-xs text-gray-500 mt-0.5">{businessLine}</p>}
            </div>
            <div className="w-11 h-11 shrink-0 rounded-xl bg-emerald-600 text-white font-bold text-sm flex items-center justify-center">
              {businessInitials}
            </div>
          </div>

          <div className="mt-6 flex items-end justify-between gap-3">
            <div>
              <h4 className="text-3xl font-extrabold text-gray-900 tracking-tight">INVOICE</h4>
              <p className="text-xs text-gray-500 mt-0.5">{invoice.invoiceNumber}</p>
            </div>
            <div className="text-right text-xs text-gray-500 space-y-0.5">
              <p>Issued {formatDate(invoice.issueDate)}</p>
              <p>Due {formatDate(invoice.dueDate)}</p>
            </div>
          </div>

          <div className="mt-6">
            <p className="text-[10px] font-semibold tracking-widest text-gray-400">BILL TO</p>
            <p className="text-base font-bold text-gray-900 mt-1">{invoice.customerName}</p>
            {billToLine && <p className="text-xs text-gray-500 mt-0.5">{billToLine}</p>}
          </div>

          <div className="mt-6 flex justify-between text-[10px] font-semibold tracking-widest text-gray-400 pb-2 border-b border-gray-200">
            <span>ITEM</span>
            <span>AMOUNT</span>
          </div>

          <ul className="py-3 space-y-2.5">
            {invoice.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="text-gray-900">{item.description}</p>
                  {item.quantity > 1 && (
                    <p className="text-xs text-gray-500">
                      {item.quantity} × {money(item.unitPrice)}
                    </p>
                  )}
                </div>
                <p className="font-bold text-gray-900 shrink-0">{money(item.total)}</p>
              </li>
            ))}
          </ul>

          <dl className="space-y-1.5 text-sm border-t border-gray-100 pt-3">
            <div className="flex justify-between text-gray-600">
              <dt>Subtotal</dt>
              <dd>{money(invoice.subtotal)}</dd>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-gray-600">
                <dt>Discount</dt>
                <dd>- {money(discountAmount)}</dd>
              </div>
            )}
            <div className="flex justify-between text-gray-600">
              <dt>Tax</dt>
              <dd>{money(invoice.tax)}</dd>
            </div>
          </dl>

          <div className="mt-3 flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3">
            <span className="text-sm font-bold text-emerald-800">Total due</span>
            <span className="text-2xl font-bold text-emerald-700">{money(invoice.total)}</span>
          </div>

          <p className="mt-5 text-center text-[11px] text-gray-400">{footerNote}</p>
        </section>

        {/* Delivery */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <h3 className="text-lg font-bold text-gray-900">Delivery</h3>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Recipient email</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="email"
                inputMode="email"
                value={recipient}
                onChange={(e) => {
                  setRecipient(e.target.value);
                  setRecipientError('');
                }}
                placeholder="client@example.com"
                className={cn(
                  'w-full h-12 rounded-xl border bg-white pl-10 pr-3.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:ring-2 transition',
                  recipientError
                    ? 'border-red-400 focus:border-red-500 focus:ring-red-100'
                    : 'border-gray-300 focus:border-emerald-500 focus:ring-emerald-100'
                )}
              />
            </div>
            {recipientError && <p className="mt-1 text-xs text-red-500">{recipientError}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">CC</label>
            <input
              value={cc}
              onChange={(e) => {
                setCc(e.target.value);
                setCcError('');
              }}
              placeholder="Add another recipient"
              className={cn(
                'w-full h-12 rounded-xl border bg-white px-3.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:ring-2 transition',
                ccError
                  ? 'border-red-400 focus:border-red-500 focus:ring-red-100'
                  : 'border-gray-300 focus:border-emerald-500 focus:ring-emerald-100'
              )}
            />
            {ccError && <p className="mt-1 text-xs text-red-500">{ccError}</p>}
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">Attach PDF copy</p>
              <p className="text-[11px] text-gray-500">Include a downloadable PDF</p>
            </div>
            <Toggle checked={attachPdf} onChange={setAttachPdf} label="Attach PDF copy" />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">Request read receipt</p>
              <p className="text-[11px] text-gray-500">Notify me when opened</p>
            </div>
            <Toggle checked={readReceipt} onChange={setReadReceipt} label="Request read receipt" />
          </div>
        </section>

        {/* Secondary actions */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={handleDownloadPdf}
            className="h-12 rounded-xl border-2 border-emerald-600 text-sm font-semibold text-emerald-700 bg-white hover:bg-emerald-50 transition-colors"
          >
            Download PDF
          </button>
          <button
            onClick={handleShare}
            className="h-12 rounded-xl border-2 border-emerald-600 text-sm font-semibold text-emerald-700 bg-white hover:bg-emerald-50 transition-colors"
          >
            Share
          </button>
        </div>

        {/* Ready to send */}
        <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
            <ShieldCheck className="w-4 h-4" />
            Ready to send
          </div>
          <p className="mt-1.5 text-xs text-emerald-700 leading-relaxed">
            Your email app will open with this invoice ready to send to {invoice.customerName}.
          </p>
        </div>
      </div>

      {/* Sticky send bar */}
      <div className="fixed bottom-0 left-0 right-0 lg:left-60 z-40 bg-white/95 backdrop-blur border-t border-gray-100 px-4 py-3">
        <div className="max-w-xl mx-auto">
          <button
            onClick={handleSend}
            className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold text-white transition-colors"
          >
            Send invoice · {money(invoice.total)}
          </button>
        </div>
      </div>
    </div>
  );
}