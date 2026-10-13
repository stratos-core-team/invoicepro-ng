import { useEffect, useMemo, useState } from 'react';
import {
  Search,
  SlidersHorizontal,
  ChevronRight,
  Plus,
  Check,
  Palette,
  Repeat,
  Megaphone,
  Presentation,
  BookOpen,
  Code2,
  Package,
  Briefcase,
  PackageSearch,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { CatalogItem } from '@/types';
import { cn } from '@/lib/utils';
import { trackEvent } from '@/utils/analytics';

interface CatalogProps {
  items: CatalogItem[];
  onAdd: () => void;
  onOpen: (item: CatalogItem) => void;
}

/* ---------- Types & constants ---------- */

type TypeTab = 'all' | 'service' | 'product';
type StatusFilter = 'active' | 'inactive' | 'all';
type SortBy = 'az' | 'za' | 'high' | 'low' | 'newest';

const TABS: { value: TypeTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'service', label: 'Services' },
  { value: 'product', label: 'Products' },
];

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'all', label: 'All items' },
];

const SORT_OPTIONS: { value: SortBy; label: string; short: string }[] = [
  { value: 'az', label: 'Name A–Z', short: 'A–Z' },
  { value: 'za', label: 'Name Z–A', short: 'Z–A' },
  { value: 'high', label: 'Price: high to low', short: 'Price ↓' },
  { value: 'low', label: 'Price: low to high', short: 'Price ↑' },
  { value: 'newest', label: 'Newest first', short: 'Newest' },
];

/* ---------- Helpers (outside the component) ---------- */

const formatMoney = (amount: number, currency: string) =>
  new Intl.NumberFormat(currency === 'NGN' ? 'en-NG' : 'en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);

/** Picks an icon from the item name, falling back to the item type */
const pickIcon = (item: CatalogItem): LucideIcon => {
  const name = item.name.toLowerCase();
  if (/brand|design|logo|creative/.test(name)) return Palette;
  if (/retainer|monthly|recurring|subscription/.test(name)) return Repeat;
  if (/social|launch|marketing|campaign|\bads?\b/.test(name)) return Megaphone;
  if (/workshop|strategy|training|consult|presentation/.test(name)) return Presentation;
  if (/book|guide|manual|print/.test(name)) return BookOpen;
  if (/code|develop|website|\bweb\b|\bapp\b|software/.test(name)) return Code2;
  return item.type === 'product' ? Package : Briefcase;
};

const secondLine = (item: CatalogItem) =>
  [
    item.type === 'service' ? 'Service' : 'Product',
    item.type === 'product' && item.sku ? `SKU ${item.sku}` : item.unit,
  ]
    .filter(Boolean)
    .join(' · ');

const thirdLine = (item: CatalogItem) => {
  const parts: string[] = [];
  if (item.trackInventory && item.stockQuantity !== undefined) {
    parts.push(`${item.stockQuantity} in stock`);
  }
  parts.push(item.taxRate > 0 ? `Tax ${item.taxRate}%` : 'Tax exempt');
  if (!item.active) parts.push('Inactive');
  return parts.join(' · ');
};

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

/* ---------- Component ---------- */

export function Catalog({ items, onAdd, onOpen }: CatalogProps) {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<TypeTab>('all');
  const [status, setStatus] = useState<StatusFilter>('active');
  const [sortBy, setSortBy] = useState<SortBy>('az');
  const [menu, setMenu] = useState<'filter' | 'sort' | null>(null);

  useEffect(() => {
    trackEvent('catalog_viewed', { items_count: items.length });
  }, [items.length]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();

    const list = items.filter((item) => {
      if (tab !== 'all' && item.type !== tab) return false;
      if (status === 'active' && !item.active) return false;
      if (status === 'inactive' && item.active) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
      );
    });

    return [...list].sort((a, b) => {
      switch (sortBy) {
        case 'za':
          return collator.compare(b.name, a.name);
        case 'high':
          return b.unitPrice - a.unitPrice;
        case 'low':
          return a.unitPrice - b.unitPrice;
        case 'newest':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        default:
          return collator.compare(a.name, b.name);
      }
    });
  }, [items, query, tab, status, sortBy]);

  const statusLabel = STATUS_OPTIONS.find((o) => o.value === status)?.label ?? 'Active';
  const sortShort = SORT_OPTIONS.find((o) => o.value === sortBy)?.short ?? 'A–Z';
  const hasFilters = query !== '' || tab !== 'all' || status !== 'active';

  /* ---------- Actions ---------- */

  const handleAdd = (source: string) => {
    trackEvent('catalog_add_clicked', { source });
    onAdd();
  };

  const handleOpen = (item: CatalogItem) => {
    trackEvent('catalog_item_opened', { item_type: item.type, active: item.active });
    onOpen(item);
  };

  const chooseTab = (value: TypeTab) => {
    setTab(value);
    trackEvent('catalog_filter_changed', { filter: 'type', value });
  };

  const chooseStatus = (value: StatusFilter) => {
    setStatus(value);
    setMenu(null);
    trackEvent('catalog_filter_changed', { filter: 'status', value });
  };

  const chooseSort = (value: SortBy) => {
    setSortBy(value);
    setMenu(null);
    trackEvent('catalog_filter_changed', { filter: 'sort', value });
  };

  const clearFilters = () => {
    setQuery('');
    setTab('all');
    setStatus('active');
  };

  /* ---------- Render ---------- */

  return (
    <div className="min-h-screen bg-slate-50 pb-28 lg:pb-8">
      {/* Header */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 leading-tight">Products &amp; services</h2>
            <p className="text-xs text-gray-600">
              {items.length} catalog item{items.length === 1 ? '' : 's'}
            </p>
          </div>
          <button
            onClick={() => handleAdd('catalog_header_button')}
            aria-label="Add product or service"
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
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search catalog"
              className="flex-1 min-w-0 bg-transparent text-[15px] text-gray-900 outline-none placeholder:text-gray-400"
            />
            <button
              onClick={() => setMenu(menu === 'filter' ? null : 'filter')}
              aria-label="Filter by status"
              className={cn(
                'shrink-0 p-1 transition-colors',
                status !== 'active' ? 'text-emerald-600' : 'text-gray-500 hover:text-gray-800'
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
                <p className="px-3 pb-1 pt-0.5 text-[10px] font-semibold tracking-widest text-gray-400">STATUS</p>
                {STATUS_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => chooseStatus(option.value)}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-700 hover:bg-slate-50"
                  >
                    {option.label}
                    {status === option.value && <Check className="w-4 h-4 text-emerald-600" />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Type tabs */}
        <div className="grid grid-cols-3 gap-1 rounded-2xl bg-slate-200/70 p-1.5" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.value}
              role="tab"
              aria-selected={tab === t.value}
              onClick={() => chooseTab(t.value)}
              className={cn(
                'h-10 rounded-xl text-sm transition-colors',
                tab === t.value
                  ? 'bg-white text-emerald-700 font-bold shadow-sm'
                  : 'text-gray-600 font-medium hover:text-gray-900'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Filter + sort labels */}
        <div className="relative flex items-center justify-between text-sm">
          <button
            onClick={() => setMenu(menu === 'filter' ? null : 'filter')}
            className="font-bold text-emerald-700"
          >
            Filter: {statusLabel}
          </button>
          <button
            onClick={() => setMenu(menu === 'sort' ? null : 'sort')}
            className="text-gray-600 hover:text-gray-900"
          >
            Sort: {sortShort}
          </button>

          {menu === 'sort' && (
            <>
              <button
                aria-hidden
                tabIndex={-1}
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setMenu(null)}
              />
              <div className="absolute right-0 top-full mt-2 z-20 w-52 rounded-xl bg-white border border-gray-100 shadow-lg py-1.5">
                {SORT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => chooseSort(option.value)}
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

        {/* List */}
        {items.length === 0 ? (
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-8 text-center">
            <PackageSearch className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="font-semibold text-gray-900">Your catalog is empty</p>
            <p className="text-sm text-gray-500 mt-1 mb-4">
              Save the things you sell once, then add them to invoices in a tap.
            </p>
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-8 text-center">
            <PackageSearch className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-2">No items match your filters</p>
             {hasFilters && (
              <button onClick={clearFilters} className="text-sm font-medium text-emerald-600 hover:underline">
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <ul className="rounded-2xl bg-white border border-gray-100 shadow-sm divide-y divide-gray-100 overflow-hidden">
            {visible.map((item) => {
              const Icon = pickIcon(item);
              return (
                <li key={item.id}>
                  <button
                    onClick={() => handleOpen(item)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-slate-50 transition-colors',
                      !item.active && 'opacity-60'
                    )}
                  >
                    <span className="w-12 h-12 shrink-0 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <Icon className="w-5 h-5" />
                    </span>

                    <span className="flex-1 min-w-0">
                      <span className="block text-[15px] font-bold text-gray-900 truncate">{item.name}</span>
                      <span className="block text-xs text-gray-600 truncate">{secondLine(item)}</span>
                      <span className="block text-[11px] text-gray-400 truncate">{thirdLine(item)}</span>
                    </span>

                    <span className="shrink-0 text-[15px] font-bold text-gray-900">
                      {formatMoney(item.unitPrice, item.currency)}
                    </span>
                    <ChevronRight className="w-4 h-4 shrink-0 text-gray-400" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* Add */}
        <button
          onClick={() => handleAdd('catalog_bottom_button')}
          className="w-full h-14 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-base font-semibold text-white transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add product or service
        </button>
      </div>
    </div>
  );
}