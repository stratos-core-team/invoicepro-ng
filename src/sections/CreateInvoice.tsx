import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronLeft, ChevronDown, Building2, Trash2, UploadCloud, X, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label as UILabel } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { Invoice, InvoiceItem, Customer, BusinessInfo } from '@/types';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { trackEvent } from '@/utils/analytics';
import { EVENTS } from '@/analytics/events';

declare global {
  interface Window {
    gtag: (...args: unknown[]) => void;
  }
}

interface CreateInvoiceProps {
  customers: Customer[];
  businessInfo: BusinessInfo;
  onReview: (invoice: Invoice) => void;
  onAddCustomer: (customer: Customer) => void;
  onCancel: () => void;
  /** Optional: when provided, invoice numbers are sequential (INV-2026-001). Otherwise random, as before. */
  invoiceCount?: number;
}

/* ---------- Constants & helpers ---------- */

const DRAFT_KEY = 'invoicepro_invoice_draft';
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

const CURRENCIES = [
  { code: 'NGN', label: 'NGN (₦)' },
  { code: 'USD', label: 'USD ($)' },
  { code: 'GBP', label: 'GBP (£)' },
  { code: 'EUR', label: 'EUR (€)' },
];

const PAYMENT_TERM_OPTIONS = [
  { label: 'Due on receipt', value: '0' },
  { label: 'Net 7', value: '7' },
  { label: 'Net 14', value: '14' },
  { label: 'Net 30', value: '30' },
  { label: 'Net 60', value: '60' },
  { label: 'Custom date', value: 'custom' },
];

const toISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const addDays = (isoDate: string, days: number) => {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toISODate(d);
};

const num = (value: string) => {
  const n = parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const cleanNumber = (value: string) => value.replace(/[^0-9.]/g, '');

interface LineItemForm {
  id: string;
  name: string;
  details: string;
  qty: string;
  rate: string;
}

interface FormState {
  customerId: string;
  issueDate: string;
  dueDate: string;
  invoiceNumber: string;
  currency: string;
  items: LineItemForm[];
  taxRate: string;
  discount: string;
  paymentTerm: string;
  notes: string;
  recurring: boolean;
}

const newLineItem = (): LineItemForm => ({
  id: crypto.randomUUID(),
  name: '',
  details: '',
  qty: '1',
  rate: '',
});

const generateInvoiceNumber = (invoiceCount?: number) => {
  const year = new Date().getFullYear();
  if (invoiceCount !== undefined) {
    return `INV-${year}-${String(invoiceCount + 1).padStart(3, '0')}`;
  }
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `INV-${year}-${random}`;
};

const buildDefaults = (businessInfo: BusinessInfo, invoiceCount?: number): FormState => {
  const today = toISODate(new Date());
  return {
    customerId: '',
    issueDate: today,
    dueDate: addDays(today, 14),
    invoiceNumber: generateInvoiceNumber(invoiceCount),
    currency: 'NGN',
    items: [newLineItem()],
    taxRate: '7.5',
    discount: '',
    paymentTerm: '14',
    notes: `Thank you for choosing ${businessInfo.name}. Please include the invoice number with payment.`,
    recurring: false,
  };
};

const loadDraft = (): FormState | null => {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FormState;
    return Array.isArray(parsed.items) && parsed.items.length > 0 ? parsed : null;
  } catch {
    return null;
  }
};

/** An item is complete when it has a name, a quantity and a rate. */
const isValidItem = (it: LineItemForm) =>
  it.name.trim().length > 0 && num(it.qty) > 0 && num(it.rate) > 0;

/* ---------- Small UI helpers (outside the component so inputs keep focus) ---------- */

const inputClass =
  'w-full h-12 rounded-xl border border-gray-300 bg-white px-3.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition';

function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="block text-xs font-semibold text-gray-700 mb-1.5">{children}</label>;
}

function SelectField({
  value,
  onChange,
  children,
  icon,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="relative">
      {icon && (
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
          {icon}
        </span>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(inputClass, 'appearance-none pr-9', icon && 'pl-10')}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
    </div>
  );
}

function Section({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn('bg-white rounded-2xl border border-gray-100 shadow-sm p-4', className)}>
      {children}
    </section>
  );
}

/* ---------- Component ---------- */

export function CreateInvoice({
  customers,
  businessInfo,
  onReview, 
  onAddCustomer,
  onCancel,
  invoiceCount,
}: CreateInvoiceProps) {
  const [initialDraft] = useState(loadDraft);
  const [form, setForm] = useState<FormState>(
    () => initialDraft ?? buildDefaults(businessInfo, invoiceCount)
  );
  const [statusText, setStatusText] = useState(initialDraft ? 'Draft restored' : 'New invoice');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [sheetMode, setSheetMode] = useState<'preview' | 'review' | null>(null);
  const [showItemErrors, setShowItemErrors] = useState(false);

  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');
  const [newCustomerAddress, setNewCustomerAddress] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const firstRender = useRef(true);

  // Track invoice form start only once per visit to this page
  const hasTrackedFormStart = useRef(false);
  const trackFormStart = () => {
    if (hasTrackedFormStart.current) return;
    hasTrackedFormStart.current = true;
    trackEvent(EVENTS.INVOICE_FORM_STARTED, { source: 'create_invoice_page' });
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    trackFormStart();
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const saveDraftNow = (silent = false) => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
      const time = new Date().toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit' });
      setStatusText(`Draft saved at ${time}`);
      if (!silent) toast.success('Draft saved');
    } catch {
      if (!silent) toast.error('Could not save draft');
    }
  };

  // Autosave the form so nothing is lost if the user leaves the page
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const timer = setTimeout(() => saveDraftNow(true), 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  /* ---------- Calculations ---------- */

  const taxRate = num(form.taxRate);
  const discountPct = Math.min(num(form.discount), 100);

  // Totals update live from Qty x Rate on every item (a name is NOT needed for the math)
  const totals = useMemo(() => {
    const subtotal = form.items.reduce((sum, it) => sum + num(it.qty) * num(it.rate), 0);
    const discount = (subtotal * discountPct) / 100;
    const taxable = subtotal - discount;
    const tax = (taxable * taxRate) / 100;
    return { subtotal, discount, tax, total: taxable + tax };
  }, [form.items, discountPct, taxRate]);

  const formatMoney = (amount: number) =>
    new Intl.NumberFormat(form.currency === 'NGN' ? 'en-NG' : 'en-US', {
      style: 'currency',
      currency: form.currency,
      minimumFractionDigits: 2,
    }).format(amount);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === form.customerId),
    [customers, form.customerId]
  );

  const formatDate = (iso: string) =>
    iso
      ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-NG', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : '-';

  /* ---------- Handlers ---------- */

  const handleCustomerChange = (value: string) => {
    if (value === '__new__') {
      setIsAddCustomerOpen(true);
      return;
    }
    set('customerId', value);
  };

  const handleIssueDateChange = (value: string) => {
    trackFormStart();
    setForm((prev) => ({
      ...prev,
      issueDate: value,
      dueDate:
        value && prev.paymentTerm !== 'custom'
          ? addDays(value, Number(prev.paymentTerm))
          : prev.dueDate,
    }));
  };

  const handleTermChange = (value: string) => {
    trackFormStart();
    setForm((prev) => ({
      ...prev,
      paymentTerm: value,
      dueDate:
        value !== 'custom' && prev.issueDate
          ? addDays(prev.issueDate, Number(value))
          : prev.dueDate,
    }));
  };

  const handleDueDateChange = (value: string) => {
    trackFormStart();
    setForm((prev) => ({ ...prev, dueDate: value, paymentTerm: 'custom' }));
  };

  const updateItem = (id: string, patch: Partial<LineItemForm>) => {
    trackFormStart();
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    }));
  };

  const handleAddItem = () => {
    trackFormStart();
    setForm((prev) => ({ ...prev, items: [...prev.items, newLineItem()] }));
  };

  const handleRemoveItem = (id: string) => {
    if (form.items.length > 1) {
      setForm((prev) => ({ ...prev, items: prev.items.filter((it) => it.id !== id) }));
    }
  };

  const handleAddCustomer = () => {
    if (!newCustomerName.trim()) {
      toast.error('Customer name is required');
      return;
    }

    const newCustomer: Customer = {
      id: crypto.randomUUID(),
      name: newCustomerName,
      phone: newCustomerPhone,
      email: newCustomerEmail,
      address: newCustomerAddress,
      createdAt: new Date().toISOString(),
    };

    onAddCustomer(newCustomer);

    trackEvent(EVENTS.CLIENT_CREATED, {
      customer_id: newCustomer.id,
      has_phone: Boolean(newCustomer.phone?.trim()),
      has_email: Boolean(newCustomer.email?.trim()),
      has_address: Boolean(newCustomer.address?.trim()),
      source: 'create_invoice_modal',
    });

    set('customerId', newCustomer.id);
    setIsAddCustomerOpen(false);
    setNewCustomerName('');
    setNewCustomerPhone('');
    setNewCustomerEmail('');
    setNewCustomerAddress('');
    toast.success('Customer added successfully');
  };

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error('Only PDF, JPG or PNG files are allowed');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error('File is too large (max 10 MB)');
      return;
    }
    setAttachment(file);
  };

  /** Returns true when the form is ready; otherwise tracks + toasts exactly what is missing. */
  const validate = (): boolean => {
    if (!selectedCustomer) {
      trackEvent(EVENTS.INVOICE_CREATION_FAILED, { reason: 'missing_customer' });
      toast.error('Please select a customer');
      return false;
    }

    const itemsWithRate = form.items.filter((it) => num(it.rate) > 0);

    if (itemsWithRate.length === 0) {
      trackEvent(EVENTS.INVOICE_CREATION_FAILED, { reason: 'no_valid_items' });
      toast.error('Enter a rate for at least one item');
      return false;
    }

    if (itemsWithRate.some((it) => !it.name.trim())) {
      setShowItemErrors(true);
      trackEvent(EVENTS.INVOICE_CREATION_FAILED, { reason: 'missing_item_name' });
      toast.error('Give each item a name');
      return false;
    }

    if (itemsWithRate.some((it) => num(it.qty) <= 0)) {
      trackEvent(EVENTS.INVOICE_CREATION_FAILED, { reason: 'missing_item_quantity' });
      toast.error('Quantity must be at least 1');
      return false;
    }

    if (form.dueDate && form.issueDate && form.dueDate < form.issueDate) {
      trackEvent(EVENTS.INVOICE_CREATION_FAILED, { reason: 'invalid_due_date' });
      toast.error('Due date cannot be before the issue date');
      return false;
    }

    return true;
  };

    const handleReview = () => {
    if (!validate() || !selectedCustomer) return;

    const validItems: InvoiceItem[] = form.items.filter(isValidItem).map((it) => {
      const quantity = num(it.qty);
      const unitPrice = num(it.rate);
      return {
        id: it.id,
        description: it.name.trim(),
        details: it.details.trim() || undefined,
        quantity,
        unitPrice,
        total: quantity * unitPrice,
      };
    });

    const termLabel =
      form.paymentTerm === 'custom'
        ? `Due by ${formatDate(form.dueDate)}`
        : PAYMENT_TERM_OPTIONS.find((o) => o.value === form.paymentTerm)?.label ?? 'Net 14';

    const invoice: Invoice = {
      id: crypto.randomUUID(),
      invoiceNumber: form.invoiceNumber.trim() || generateInvoiceNumber(invoiceCount),
      customerId: selectedCustomer.id,
      customerName: selectedCustomer.name,
      customerPhone: selectedCustomer.phone,
      customerEmail: selectedCustomer.email,
      customerAddress: selectedCustomer.address,
      items: validItems,
      subtotal: totals.subtotal,
      tax: totals.tax,
      taxRate,
      discount: totals.discount,
      discountPercent: discountPct,
      total: totals.total,
      currency: form.currency,
      recurring: form.recurring,
      notes: form.notes,
      paymentTerms: termLabel,
      issueDate: new Date(`${form.issueDate}T00:00:00`).toISOString(),
      dueDate: form.dueDate,
      status: 'unpaid',
      createdAt: new Date().toISOString(),
    };

    // Keep the form so "back" from the preview page restores everything
    saveDraftNow(true);

    trackEvent('invoice_review_opened', {
      total: invoice.total,
      items_count: invoice.items.length,
    });

    onReview(invoice);
  };
  const openSheet = (mode: 'preview' | 'review') => {
    if (!validate()) return;
    trackEvent(mode === 'preview' ? 'invoice_preview_opened' : 'invoice_review_opened', {
      total: totals.total,
    });
    setSheetMode(mode);
  };

  /* ---------- Render ---------- */

  const selectValue = customers.some((c) => c.id === form.customerId) ? form.customerId : '';

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      <div className="max-w-xl mx-auto p-4 space-y-4">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onCancel}
              aria-label="Back"
              className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-base font-bold text-gray-900 leading-tight">Create invoice</h2>
              <p className="text-xs text-gray-500">{statusText}</p>
            </div>
          </div>
          <button
            onClick={() => saveDraftNow()}
            className="text-sm font-semibold text-emerald-700 hover:text-emerald-800"
          >
            Save draft
          </button>
        </div>

        {/* Customer & dates */}
        <Section className="space-y-4">
          <div>
            <FieldLabel>Customer</FieldLabel>
            <SelectField
              value={selectValue}
              onChange={handleCustomerChange}
              icon={<Building2 className="w-4 h-4" />}
            >
              <option value="">Select a customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value="__new__">+ Add new customer</option>
            </SelectField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Issue Date</FieldLabel>
              <input
                type="date"
                value={form.issueDate}
                onChange={(e) => handleIssueDateChange(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <FieldLabel>Due Date</FieldLabel>
              <input
                type="date"
                value={form.dueDate}
                min={form.issueDate}
                onChange={(e) => handleDueDateChange(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Invoice number</FieldLabel>
              <input
                value={form.invoiceNumber}
                onChange={(e) => set('invoiceNumber', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <FieldLabel>Currency</FieldLabel>
              <SelectField value={form.currency} onChange={(v) => set('currency', v)}>
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </SelectField>
            </div>
          </div>
        </Section>

        {/* Line items */}
        <Section>
          <h3 className="text-lg font-bold text-gray-900 mb-4">Line items</h3>

          <div className="space-y-4">
            {form.items.map((item, index) => {
              const lineTotal = num(item.qty) * num(item.rate) * (1 + taxRate / 100);
              const missingName = showItemErrors && num(item.rate) > 0 && !item.name.trim();

              return (
                <div
                  key={item.id}
                  className="rounded-xl border border-gray-200 bg-slate-50 p-3.5 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wide text-emerald-700">
                      Item {index + 1}
                    </span>
                    <button
                      onClick={() => handleRemoveItem(item.id)}
                      disabled={form.items.length === 1}
                      aria-label="Remove item"
                      className="p-1 text-red-400 hover:text-red-600 disabled:opacity-30 disabled:hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div>
                    <FieldLabel>Item name</FieldLabel>
                    <input
                      value={item.name}
                      onChange={(e) => updateItem(item.id, { name: e.target.value })}
                      placeholder="e.g. Website design"
                      className={cn(
                        inputClass,
                        missingName && 'border-red-400 focus:border-red-500 focus:ring-red-100'
                      )}
                    />
                    {missingName && (
                      <p className="mt-1 text-xs text-red-500">Enter a name for this item</p>
                    )}
                  </div>

                  <div>
                    <FieldLabel>Description (optional)</FieldLabel>
                    <input
                      value={item.details}
                      onChange={(e) => updateItem(item.id, { details: e.target.value })}
                      placeholder="Short details for your client"
                      className={cn(inputClass, 'h-11')}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <FieldLabel>Qty</FieldLabel>
                      <input
                        inputMode="decimal"
                        value={item.qty}
                        onChange={(e) => updateItem(item.id, { qty: cleanNumber(e.target.value) })}
                        placeholder="1"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <FieldLabel>Rate</FieldLabel>
                      <input
                        inputMode="decimal"
                        value={item.rate}
                        onChange={(e) => updateItem(item.id, { rate: cleanNumber(e.target.value) })}
                        placeholder="0.00"
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-gray-200 pt-3">
                    <span className="text-xs text-gray-500">
                      {taxRate > 0 ? `Includes tax ${taxRate}%` : 'No tax'}
                    </span>
                    <span className="text-sm font-bold text-gray-900">{formatMoney(lineTotal)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleAddItem}
            className="mt-4 w-full h-12 rounded-xl border-2 border-dashed border-emerald-400 bg-emerald-50 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors flex items-center justify-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Add item
          </button>
        </Section>

        {/* Tax, discount & totals */}
        <Section>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Tax</FieldLabel>
              <SelectField value={form.taxRate} onChange={(v) => set('taxRate', v)}>
                <option value="0">No tax</option>
                <option value="7.5">7.5% VAT</option>
              </SelectField>
            </div>
            <div>
              <FieldLabel>Discount</FieldLabel>
              <div className="relative">
                <input
                  inputMode="decimal"
                  value={form.discount}
                  onChange={(e) => set('discount', cleanNumber(e.target.value))}
                  placeholder="0"
                  className={cn(inputClass, 'pr-8')}
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                  %
                </span>
              </div>
            </div>
          </div>

          <dl className="mt-5 space-y-2 text-sm">
            <div className="flex justify-between text-gray-600">
              <dt>Subtotal</dt>
              <dd className="font-semibold text-gray-900">{formatMoney(totals.subtotal)}</dd>
            </div>
            <div className="flex justify-between text-gray-600">
              <dt>Discount</dt>
              <dd className="font-semibold text-gray-900">
                {totals.discount > 0 ? `- ${formatMoney(totals.discount)}` : formatMoney(0)}
              </dd>
            </div>
            <div className="flex justify-between text-gray-600">
              <dt>Tax</dt>
              <dd className="font-semibold text-gray-900">{formatMoney(totals.tax)}</dd>
            </div>
            <div className="flex justify-between items-baseline border-t border-gray-100 pt-3 mt-3">
              <dt className="text-base font-bold text-gray-900">Total</dt>
              <dd className="text-2xl font-bold text-gray-900">{formatMoney(totals.total)}</dd>
            </div>
          </dl>
        </Section>

        {/* Terms, notes, attachment, recurring */}
        <Section className="space-y-4">
          <div>
            <FieldLabel>Payment terms</FieldLabel>
            <SelectField value={form.paymentTerm} onChange={handleTermChange}>
              {PAYMENT_TERM_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </SelectField>
          </div>

          <div>
            <FieldLabel>Notes</FieldLabel>
            <textarea
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={3}
              placeholder="e.g. Please transfer payment to GTBank 0123456789 (My Business Ltd)."
              className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition resize-none"
            />
          </div>

          {/* Attachment */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="hidden"
              onChange={(e) => {
                handleFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            {attachment ? (
              <div className="flex items-center justify-between rounded-xl border border-gray-200 px-3.5 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{attachment.name}</p>
                  <p className="text-xs text-gray-500">{(attachment.size / 1024).toFixed(0)} KB</p>
                </div>
                <button
                  onClick={() => setAttachment(null)}
                  aria-label="Remove attachment"
                  className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleFile(e.dataTransfer.files?.[0]);
                }}
                className="w-full rounded-xl border-2 border-dashed border-gray-300 hover:border-emerald-400 hover:bg-emerald-50/40 py-6 flex flex-col items-center gap-1.5 transition-colors"
              >
                <UploadCloud className="w-6 h-6 text-emerald-600" />
                <span className="text-sm font-semibold text-gray-900">Add attachment</span>
                <span className="text-[11px] text-gray-500">PDF, JPG or PNG · max 10 MB</span>
              </button>
            )}
          </div>

          {/* Recurring */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">Make recurring</p>
              <p className="text-[11px] text-gray-500">Repeat this invoice automatically</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={form.recurring}
              onClick={() => set('recurring', !form.recurring)}
              className={cn(
                'relative w-12 h-7 rounded-full transition-colors',
                form.recurring ? 'bg-emerald-600' : 'bg-gray-300'
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform',
                  form.recurring && 'translate-x-5'
                )}
              />
            </button>
          </div>
        </Section>
      </div>

      {/* Sticky action bar */}
      <div className="fixed bottom-0 left-0 right-0 lg:left-60 z-40 bg-white/95 backdrop-blur border-t border-gray-100 px-4 py-3">
        <div className="max-w-xl mx-auto grid grid-cols-[1fr_1.6fr] gap-3">
          <button
            onClick={() => openSheet('preview')}
            className="h-12 rounded-xl bg-gray-100 hover:bg-gray-200 text-sm font-semibold text-gray-800 transition-colors"
          >
            Preview
          </button>
          <button
            onClick={handleReview}
            className="h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold text-white transition-colors"
          >
            Review &amp; send
          </button>
        </div>
      </div>

      {/* Preview / review sheet */}
      {sheetMode && (
        <div
          className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center"
          onClick={() => setSheetMode(null)}
        >
          <div
            className="w-full max-w-md max-h-[88vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-gray-500">{businessInfo.name}</p>
                <h3 className="text-lg font-bold text-gray-900">{form.invoiceNumber}</h3>
              </div>
              <button
                onClick={() => setSheetMode(null)}
                aria-label="Close"
                className="p-1 text-gray-400 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-gray-500">Bill to</p>
                <p className="font-medium text-gray-900">{selectedCustomer?.name}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500">Due</p>
                <p className="font-medium text-gray-900">{formatDate(form.dueDate)}</p>
              </div>
            </div>

            <ul className="divide-y divide-gray-100 border-y border-gray-100">
              {form.items.filter(isValidItem).map((it) => (
                <li key={it.id} className="py-2.5 flex justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">{it.name}</p>
                    <p className="text-xs text-gray-500">
                      {num(it.qty)} × {formatMoney(num(it.rate))}
                    </p>
                  </div>
                  <p className="font-semibold text-gray-900">
                    {formatMoney(num(it.qty) * num(it.rate))}
                  </p>
                </li>
              ))}
            </ul>

            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between text-gray-600">
                <dt>Subtotal</dt>
                <dd>{formatMoney(totals.subtotal)}</dd>
              </div>
              {totals.discount > 0 && (
                <div className="flex justify-between text-gray-600">
                  <dt>Discount ({discountPct}%)</dt>
                  <dd>- {formatMoney(totals.discount)}</dd>
                </div>
              )}
              <div className="flex justify-between text-gray-600">
                <dt>Tax ({taxRate}%)</dt>
                <dd>{formatMoney(totals.tax)}</dd>
              </div>
              <div className="flex justify-between text-base font-bold text-gray-900 pt-2 border-t border-gray-100">
                <dt>Total</dt>
                <dd>{formatMoney(totals.total)}</dd>
              </div>
            </dl>

            {form.notes.trim() && (
              <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">{form.notes}</p>
            )}

            {sheetMode === 'review' ? (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  onClick={() => setSheetMode(null)}
                  className="h-11 rounded-xl bg-gray-100 hover:bg-gray-200 text-sm font-semibold text-gray-800 transition-colors"
                >
                  Back to edit
                </button>
                            <button
              onClick={() => setSheetMode(null)}
              className="w-full h-11 rounded-xl bg-gray-100 hover:bg-gray-200 text-sm font-semibold text-gray-800 transition-colors"
            >
              Close preview
            </button>
              </div>
            ) : (
              <button
                onClick={() => setSheetMode(null)}
                className="w-full h-11 rounded-xl bg-gray-100 hover:bg-gray-200 text-sm font-semibold text-gray-800 transition-colors"
              >
                Close preview
              </button>
            )}
          </div>
        </div>
      )}

      {/* Add customer dialog (same fields as before) */}
      <Dialog open={isAddCustomerOpen} onOpenChange={setIsAddCustomerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Customer</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <UILabel className="mb-1 block">Full Name *</UILabel>
              <Input
                placeholder="e.g. John Doe"
                value={newCustomerName}
                onChange={(e) => setNewCustomerName(e.target.value)}
              />
            </div>
            <div>
              <UILabel className="mb-1 block">Phone Number</UILabel>
              <Input
                placeholder="e.g. 08012345678"
                value={newCustomerPhone}
                onChange={(e) => setNewCustomerPhone(e.target.value)}
              />
            </div>
            <div>
              <UILabel className="mb-1 block">Email Address</UILabel>
              <Input
                placeholder="e.g. john@email.com"
                value={newCustomerEmail}
                onChange={(e) => setNewCustomerEmail(e.target.value)}
              />
            </div>
            <div>
              <UILabel className="mb-1 block">Address</UILabel>
              <Textarea
                placeholder="e.g. 12 Lagos Street, Abuja"
                value={newCustomerAddress}
                onChange={(e) => setNewCustomerAddress(e.target.value)}
              />
            </div>
            <Button
              onClick={handleAddCustomer}
              className="w-full mt-2 bg-emerald-500 hover:bg-emerald-600 text-white"
            >
              Save Customer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}