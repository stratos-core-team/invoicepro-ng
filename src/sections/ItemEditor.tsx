import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronLeft, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import type { CatalogItem, CatalogItemType } from '@/types';
import { cn } from '@/lib/utils';
import { trackEvent } from '@/utils/analytics';

interface ItemEditorProps {
  /** Pass an item to edit it; leave out to create a new one */
  item?: CatalogItem;
  /** Whole catalog, used to catch duplicate SKUs */
  items: CatalogItem[];
  onSave: (item: CatalogItem) => void;
  onCancel: () => void;
}

/* ---------- Constants & helpers ---------- */

const CURRENCIES = [
  { code: 'NGN', label: 'NGN (₦)' },
  { code: 'USD', label: 'USD ($)' },
  { code: 'GBP', label: 'GBP (£)' },
  { code: 'EUR', label: 'EUR (€)' },
];

const TAX_OPTIONS = [
  { value: '0', label: 'No tax' },
  { value: '7.5', label: '7.5% VAT' },
];

const TYPE_TABS: { value: CatalogItemType; label: string }[] = [
  { value: 'service', label: 'Service' },
  { value: 'product', label: 'Product' },
];

const num = (value: string) => {
  const n = parseFloat(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

/** Keeps digits and one decimal point (also strips thousands commas) */
const cleanNumber = (value: string) => {
  const cleaned = value.replace(/[^0-9.]/g, '');
  const [whole, ...rest] = cleaned.split('.');
  return rest.length ? `${whole}.${rest.join('')}` : whole;
};

const localeFor = (currency: string) => (currency === 'NGN' ? 'en-NG' : 'en-US');

const formatMoney = (amount: number, currency: string) =>
  new Intl.NumberFormat(localeFor(currency), {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);

const currencySymbol = (currency: string) =>
  new Intl.NumberFormat(localeFor(currency), { style: 'currency', currency })
    .formatToParts(0)
    .find((p) => p.type === 'currency')?.value ?? currency;

const groupedNumber = (value: string) => {
  if (value.trim() === '') return '';
  return num(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

interface FormState {
  type: CatalogItemType;
  name: string;
  description: string;
  unitPrice: string;
  currency: string;
  taxRate: string;
  sku: string;
  unit: string;
  trackInventory: boolean;
  stock: string;
  active: boolean;
}

const fromItem = (item?: CatalogItem): FormState =>
  item
    ? {
        type: item.type,
        name: item.name,
        description: item.description,
        unitPrice: groupedNumber(String(item.unitPrice)),
        currency: item.currency,
        taxRate: String(item.taxRate),
        sku: item.sku,
        unit: item.unit,
        trackInventory: item.trackInventory,
        stock: item.stockQuantity !== undefined ? String(item.stockQuantity) : '',
        active: item.active,
      }
    : {
        type: 'service',
        name: '',
        description: '',
        unitPrice: '',
        currency: 'NGN',
        taxRate: '7.5',
        sku: '',
        unit: '',
        trackInventory: false,
        stock: '',
        active: true,
      };

/* ---------- Small UI helpers (outside the component so inputs keep focus) ---------- */

const inputClass =
  'w-full h-12 rounded-xl border border-gray-300 bg-white px-3.5 text-[15px] text-gray-900 outline-none placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition';

const textareaClass =
  'w-full rounded-xl border border-gray-300 bg-white px-3.5 py-3 text-[15px] text-gray-900 outline-none placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition resize-none';

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
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
  chevron = false,
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

export function ItemEditor({ item, items, onSave, onCancel }: ItemEditorProps) {
  const [initial] = useState(() => fromItem(item));
  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<{ name?: string; price?: string; sku?: string; stock?: string }>({});

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const isNew = !item;
  const typeLabel = form.type === 'service' ? 'service' : 'product';

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors({});
  };

  // Keep a saved custom tax rate selectable even if it is not one of the presets
  const taxOptions = useMemo(() => {
    if (TAX_OPTIONS.some((o) => o.value === form.taxRate)) return TAX_OPTIONS;
    return [...TAX_OPTIONS, { value: form.taxRate, label: `${form.taxRate}% tax` }];
  }, [form.taxRate]);

  /* ---------- Live invoice line preview ---------- */

  const price = num(form.unitPrice);
  const taxRate = num(form.taxRate);
  const lineTotal = price * (1 + taxRate / 100);
  const previewName = form.name.trim() || 'Item name';

  /* ---------- Actions ---------- */

  const handleCancel = () => {
    if (dirty && !window.confirm('Discard your unsaved changes?')) return;
    onCancel();
  };

  const handleSave = () => {
    const next: typeof errors = {};
    const name = form.name.trim();
    const sku = form.sku.trim();

    if (!name) next.name = 'Enter a name for this item';
    if (form.unitPrice.trim() === '') next.price = 'Enter a unit price';

    if (sku && items.some((i) => i.id !== item?.id && i.sku.trim().toLowerCase() === sku.toLowerCase())) {
      next.sku = 'Another item already uses this code';
    }

    if (form.trackInventory) {
      const stock = Number(form.stock);
      if (form.stock.trim() === '' || !Number.isInteger(stock) || stock < 0) {
        next.stock = 'Enter the quantity in stock (whole number)';
      }
    }

    if (Object.keys(next).length > 0) {
      setErrors(next);
      toast.error(Object.values(next)[0] ?? 'Please check the form');
      return;
    }

    const now = new Date().toISOString();
    const saved: CatalogItem = {
      id: item?.id ?? crypto.randomUUID(),
      type: form.type,
      name,
      description: form.description.trim(),
      unitPrice: price,
      currency: form.currency,
      taxRate,
      sku,
      unit: form.unit.trim(),
      trackInventory: form.trackInventory,
      stockQuantity: form.trackInventory ? Number(form.stock) : undefined,
      active: form.active,
      createdAt: item?.createdAt ?? now,
      updatedAt: now,
    };

    trackEvent('catalog_item_saved', {
      is_new: isNew,
      item_type: saved.type,
      currency: saved.currency,
      tax_rate: saved.taxRate,
      track_inventory: saved.trackInventory,
      active: saved.active,
      has_sku: Boolean(saved.sku),
    });

    onSave(saved);
    toast.success(isNew ? 'Item added to your catalog' : 'Item saved');
  };

  /* ---------- Render ---------- */

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-xl mx-auto px-4 h-16 flex items-center gap-3">
          <button
            onClick={handleCancel}
            aria-label="Back"
            className="w-10 h-10 rounded-full bg-slate-50 border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-gray-900 leading-tight">
              {isNew ? 'New' : 'Edit'} {typeLabel}
            </h2>
            <p className="text-xs text-gray-500 truncate">{item ? item.name : 'Add to your catalog'}</p>
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto p-4 space-y-4">
        {/* Item type */}
        <div>
          <p className="px-0.5 mb-2 text-xs font-semibold text-gray-600">Item type</p>
          <div className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-200/70 p-1.5" role="radiogroup" aria-label="Item type">
            {TYPE_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                role="radio"
                aria-checked={form.type === tab.value}
                onClick={() => update('type', tab.value)}
                className={cn(
                  'h-11 rounded-xl text-sm transition-colors',
                  form.type === tab.value
                    ? 'bg-white text-emerald-700 font-bold shadow-sm'
                    : 'text-gray-600 font-medium hover:text-gray-900'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Main details */}
        <section className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4 space-y-4">
          <Field label="Name" error={errors.name}>
            <input
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder={form.type === 'service' ? 'e.g. Website design' : 'e.g. Branded notebook'}
              className={cn(inputClass, errors.name && 'border-red-400')}
            />
          </Field>

          <Field label="Description">
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              placeholder="Shown to your client on the invoice"
              className={textareaClass}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Unit price" error={errors.price}>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] text-gray-500">
                  {currencySymbol(form.currency)}
                </span>
                <input
                  inputMode="decimal"
                  value={form.unitPrice}
                  onChange={(e) => update('unitPrice', cleanNumber(e.target.value))}
                  onBlur={() => setForm((prev) => ({ ...prev, unitPrice: groupedNumber(prev.unitPrice) }))}
                  placeholder="0.00"
                  className={cn(inputClass, 'pl-9', errors.price && 'border-red-400')}
                />
              </div>
            </Field>

            <Field label="Currency">
              <SelectField value={form.currency} onChange={(v) => update('currency', v)} chevron>
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </SelectField>
            </Field>
          </div>

          <Field label="Tax">
            <SelectField value={form.taxRate} onChange={(v) => update('taxRate', v)}>
              {taxOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </SelectField>
          </Field>
        </section>

        {/* Catalog settings */}
        <section className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4 space-y-4">
          <Field label="SKU or item code" error={errors.sku}>
            <input
              value={form.sku}
              onChange={(e) => update('sku', e.target.value)}
              placeholder="e.g. SVC-BRAND-01"
              className={cn(inputClass, errors.sku && 'border-red-400')}
            />
          </Field>

          <Field label="Unit">
            <input
              value={form.unit}
              onChange={(e) => update('unit', e.target.value)}
              placeholder={form.type === 'service' ? 'e.g. Per project' : 'e.g. Per item'}
              className={inputClass}
            />
          </Field>

          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-gray-900">Track inventory</p>
              <p className="text-[11px] text-gray-500">
                {form.type === 'service' ? 'Not usually needed for services' : 'Keep count of items in stock'}
              </p>
            </div>
            <Toggle
              checked={form.trackInventory}
              onChange={(v) => update('trackInventory', v)}
              label="Track inventory"
            />
          </div>

          {form.trackInventory && (
            <Field label="Quantity in stock" error={errors.stock}>
              <input
                inputMode="numeric"
                value={form.stock}
                onChange={(e) => update('stock', e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="0"
                className={cn(inputClass, errors.stock && 'border-red-400')}
              />
            </Field>
          )}

          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-gray-900">Active in catalog</p>
              <p className="text-[11px] text-gray-500">Available when creating invoices</p>
            </div>
            <Toggle checked={form.active} onChange={(v) => update('active', v)} label="Active in catalog" />
          </div>
        </section>

        {/* Invoice line preview */}
        <section className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4">
          <p className="text-[10px] font-semibold tracking-widest text-slate-400">INVOICE LINE PREVIEW</p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[15px] font-bold text-gray-900 truncate">{previewName}</p>
              <p className="text-xs text-gray-500">
                1 × {formatMoney(price, form.currency)} · {taxRate > 0 ? `Tax ${taxRate}%` : 'No tax'}
              </p>
            </div>
            <p className="text-lg font-bold text-gray-900 shrink-0">{formatMoney(lineTotal, form.currency)}</p>
          </div>
        </section>
      </div>

      {/* Sticky action bar */}
      <div className="fixed bottom-0 left-0 right-0 lg:left-60 z-40 bg-white/95 backdrop-blur border-t border-gray-100 px-4 py-3">
        <div className="max-w-xl mx-auto grid grid-cols-[1fr_1.4fr] gap-3">
          <button
            onClick={handleCancel}
            className="h-12 rounded-xl border-2 border-emerald-600 bg-white text-sm font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold text-white transition-colors"
          >
            Save item
          </button>
        </div>
      </div>
    </div>
  );
}