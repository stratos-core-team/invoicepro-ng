import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronLeft, ImagePlus, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import type { BusinessInfo } from '@/types';
import { cn } from '@/lib/utils';
import { trackEvent } from '@/utils/analytics';

/* ---------- Brand colors (shared with PreviewSend and More) ---------- */

export const BRAND_COLORS = [
  { name: 'Emerald', value: '#10b981', text: '#047857' },
  { name: 'Blue', value: '#3b82f6', text: '#1d4ed8' },
  { name: 'Purple', value: '#8b5cf6', text: '#6d28d9' },
  { name: 'Navy', value: '#0f172a', text: '#0f172a' },
  { name: 'Amber', value: '#f59e0b', text: '#b45309' },
] as const;

/** Returns the matching brand, or Emerald when nothing has been chosen yet */
export const getBrand = (hex?: string) =>
  BRAND_COLORS.find((c) => c.value === hex) ?? BRAND_COLORS[0];

/* ---------- Constants & helpers ---------- */

const DEFAULT_FOOTER = 'Thank you for your business.';
const DEFAULT_NOTES =
  'Payment due according to the terms above. Please include the invoice number with your transfer.';

const ALLOWED_LOGO_TYPES = ['image/png', 'image/svg+xml'];
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const MAX_SVG_BYTES = 500 * 1024;
const LOGO_MAX_SIDE = 256;

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const readAsDataURL = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

/** Shrinks big PNGs so they fit comfortably in browser storage */
const resizePng = (dataUrl: string) =>
  new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, LOGO_MAX_SIDE / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas unavailable'));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = dataUrl;
  });

interface FormState {
  name: string;
  email: string;
  phone: string;
  address: string;
  taxId: string;
  logo: string;
  brandColor: string;
  footerMessage: string;
  defaultNotes: string;
  showTaxId: boolean;
  showPaymentInstructions: boolean;
}

const fromBusiness = (b: BusinessInfo): FormState => ({
  name: b.name ?? '',
  email: b.email ?? '',
  phone: b.phone ?? '',
  address: b.address ?? '',
  taxId: b.taxId ?? '',
  logo: b.logo ?? '',
  brandColor: getBrand(b.brandColor).value,
  footerMessage: b.footerMessage ?? DEFAULT_FOOTER,
  defaultNotes: b.defaultNotes ?? DEFAULT_NOTES,
  showTaxId: b.showTaxId ?? true,
  showPaymentInstructions: b.showPaymentInstructions ?? true,
});

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

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4">
      <h3 className="text-lg font-bold text-gray-900 mb-4">{title}</h3>
      {children}
    </section>
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

interface BusinessBrandingProps {
  businessInfo: BusinessInfo;
  onUpdate: (info: BusinessInfo) => void;
  onBack: () => void;
}

export function BusinessBranding({ businessInfo, onUpdate, onBack }: BusinessBrandingProps) {
  const [initial] = useState(() => fromBusiness(businessInfo));
  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const brand = getBrand(form.brandColor);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === 'name' || key === 'email') {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  };

  /* ---------- Logo ---------- */

  const handleLogoFile = async (file: File | undefined) => {
    if (!file) return;

    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      toast.error('Logo must be a PNG or SVG file');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error('Logo is too large (max 2 MB)');
      return;
    }
    if (file.type === 'image/svg+xml' && file.size > MAX_SVG_BYTES) {
      toast.error('SVG logos must be under 500 KB');
      return;
    }

    try {
      const dataUrl = await readAsDataURL(file);
      const logo = file.type === 'image/png' ? await resizePng(dataUrl) : dataUrl;
      update('logo', logo);
      trackEvent('business_logo_uploaded', { type: file.type, size_kb: Math.round(file.size / 1024) });
    } catch {
      toast.error('Could not read that image');
    }
  };

  /* ---------- Actions ---------- */

  const handleBack = () => {
    if (dirty && !window.confirm('Discard your unsaved changes?')) return;
    onBack();
  };

  const handleSave = () => {
    const name = form.name.trim();
    const email = form.email.trim();
    const nextErrors: { name?: string; email?: string } = {};

    if (!name) nextErrors.name = 'Business name is required';
    if (email && !isEmail(email)) nextErrors.email = 'Enter a valid email address';

    if (nextErrors.name || nextErrors.email) {
      setErrors(nextErrors);
      toast.error(nextErrors.name ?? nextErrors.email ?? 'Please check the form');
      return;
    }

    try {
      onUpdate({
        ...businessInfo,
        name,
        email,
        phone: form.phone.trim(),
        address: form.address.trim(),
        taxId: form.taxId.trim(),
        logo: form.logo,
        brandColor: form.brandColor,
        footerMessage: form.footerMessage.trim(),
        defaultNotes: form.defaultNotes.trim(),
        showTaxId: form.showTaxId,
        showPaymentInstructions: form.showPaymentInstructions,
      });
    } catch {
      toast.error('Could not save. Your logo may be too large for browser storage.');
      return;
    }

    trackEvent('business_branding_saved', {
      has_logo: Boolean(form.logo),
      brand_color: brand.name,
      has_tax_id: Boolean(form.taxId.trim()),
      show_tax_id: form.showTaxId,
      show_payment_instructions: form.showPaymentInstructions,
    });

    toast.success('Business details saved');
    onBack();
  };

  const previewTotal = new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 2,
  }).format(2400);

  /* ---------- Render ---------- */

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-xl mx-auto px-4 h-16 flex items-center gap-3">
          <button
            onClick={handleBack}
            aria-label="Back"
            className="w-10 h-10 rounded-full bg-slate-50 border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-base font-bold text-gray-900 leading-tight">Business &amp; branding</h2>
            <p className="text-xs text-gray-500">Customize client-facing invoices</p>
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto p-4 space-y-4">
        {/* Logo */}
        <Card title="Business logo">
          <input
            ref={fileInputRef}
            type="file"
            accept=".png,.svg,image/png,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              handleLogoFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />

          <div className="flex items-center gap-4">
            {form.logo ? (
              <div className="relative w-28 h-28 shrink-0 rounded-2xl border border-gray-200 bg-white flex items-center justify-center p-2">
                <img src={form.logo} alt="Business logo" className="max-w-full max-h-full object-contain" />
                <button
                  onClick={() => update('logo', '')}
                  aria-label="Remove logo"
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white border border-gray-200 shadow flex items-center justify-center text-gray-500 hover:text-red-500"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleLogoFile(e.dataTransfer.files?.[0]);
                }}
                className="w-28 h-28 shrink-0 rounded-2xl border-2 border-dashed border-emerald-400 bg-emerald-50 flex flex-col items-center justify-center gap-2 text-emerald-700 hover:bg-emerald-100 transition-colors"
              >
                <ImagePlus className="w-6 h-6" />
                <span className="text-xs font-semibold">Add logo</span>
              </button>
            )}

            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900">Upload your mark</p>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                PNG or SVG, square format recommended. Max 2 MB.
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
              >
                {form.logo ? 'Change file' : 'Choose file'}
              </button>
            </div>
          </div>
        </Card>

        {/* Business details */}
        <Card title="Business details">
          <div className="space-y-4">
            <Field label="Business name" error={errors.name}>
              <input
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                className={cn(inputClass, errors.name && 'border-red-400')}
              />
            </Field>

            <Field label="Business email" error={errors.email}>
              <input
                type="email"
                inputMode="email"
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
                placeholder="hello@yourbusiness.com"
                className={cn(inputClass, errors.email && 'border-red-400')}
              />
            </Field>

            <Field label="Phone">
              <input
                type="tel"
                inputMode="tel"
                value={form.phone}
                onChange={(e) => update('phone', e.target.value)}
                placeholder="+234 800 000 0000"
                className={inputClass}
              />
            </Field>

            <Field label="Address">
              <textarea
                rows={3}
                value={form.address}
                onChange={(e) => update('address', e.target.value)}
                placeholder="Street, city, state"
                className={textareaClass}
              />
            </Field>

            <Field label="Tax ID">
              <input
                value={form.taxId}
                onChange={(e) => update('taxId', e.target.value)}
                placeholder="e.g. your TIN"
                className={inputClass}
              />
            </Field>
          </div>
        </Card>

        {/* Color & theme */}
        <Card title="Invoice color & theme">
          <div className="grid grid-cols-5 gap-3">
            {BRAND_COLORS.map((color) => {
              const selected = form.brandColor === color.value;
              return (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => update('brandColor', color.value)}
                  aria-label={color.name}
                  aria-pressed={selected}
                  className={cn(
                    'h-12 rounded-xl flex items-center justify-center transition-all',
                    selected && 'ring-2 ring-offset-2 ring-gray-900'
                  )}
                  style={{ backgroundColor: color.value }}
                >
                  {selected && <Check className="w-5 h-5 text-white" />}
                </button>
              );
            })}
          </div>

          {/* Live preview */}
          <div className="mt-4 rounded-xl border border-gray-200 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-bold text-gray-900 truncate">{form.name || 'Your business'}</p>
              {form.logo ? (
                <img src={form.logo} alt="" className="w-10 h-10 rounded-lg object-contain shrink-0" />
              ) : (
                <div
                  className="w-10 h-10 rounded-lg shrink-0"
                  style={{ backgroundColor: brand.value }}
                />
              )}
            </div>

            <p className="mt-4 text-2xl font-extrabold text-gray-900 tracking-tight">INVOICE</p>

            <div className="mt-2 flex justify-between text-xs text-gray-500">
              <span>Brand identity sprint</span>
              <span className="font-bold text-gray-900">{previewTotal}</span>
            </div>

            <div
              className="mt-3 flex justify-between rounded-lg px-3 py-2.5 text-sm font-bold"
              style={{ backgroundColor: `${brand.value}1A`, color: brand.text }}
            >
              <span>Total</span>
              <span>{previewTotal}</span>
            </div>
          </div>
        </Card>

        {/* Defaults */}
        <Card title="Invoice defaults">
          <div className="space-y-4">
            <Field label="Footer message">
              <textarea
                rows={3}
                value={form.footerMessage}
                onChange={(e) => update('footerMessage', e.target.value)}
                className={textareaClass}
              />
            </Field>

            <Field label="Default notes">
              <textarea
                rows={4}
                value={form.defaultNotes}
                onChange={(e) => update('defaultNotes', e.target.value)}
                className={textareaClass}
              />
            </Field>

            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-gray-900">Show tax ID on invoices</span>
              <Toggle
                checked={form.showTaxId}
                onChange={(v) => update('showTaxId', v)}
                label="Show tax ID on invoices"
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-gray-900">Show payment instructions</span>
              <Toggle
                checked={form.showPaymentInstructions}
                onChange={(v) => update('showPaymentInstructions', v)}
                label="Show payment instructions"
              />
            </div>
          </div>
        </Card>
      </div>

      {/* Sticky action bar */}
      <div className="fixed bottom-0 left-0 right-0 lg:left-60 z-40 bg-white/95 backdrop-blur border-t border-gray-100 px-4 py-3">
        <div className="max-w-xl mx-auto grid grid-cols-[1fr_1.4fr] gap-3">
          <button
            onClick={handleBack}
            className="h-12 rounded-xl border-2 border-emerald-600 bg-white text-sm font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors"
          >
            Discard
          </button>
          <button
            onClick={handleSave}
            className="h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold text-white transition-colors"
          >
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}