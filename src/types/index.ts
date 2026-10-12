// InvoicePro NG Types

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  createdAt: string;
}

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  details?: string;
}

export type InvoiceStatus = 'paid' | 'unpaid' | 'overdue';

export interface Invoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerAddress: string;
  items: InvoiceItem[];
  subtotal: number;
  tax: number;
  taxRate: number;
  total: number;
  notes: string;
  paymentTerms: string;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  createdAt: string;
  paidAt?: string;
  currency?: string;
  discount?: number;         // discount amount
  discountPercent?: number;
  recurring?: boolean;
}

export interface BusinessInfo {
  name: string;
  address: string;
  phone: string;
  email: string;
  taxId?: string;
  logo?: string;                    // data URL
  brandColor?: string;              // hex, e.g. '#10b981'
  footerMessage?: string;
  defaultNotes?: string;
  showTaxId?: boolean;
  showPaymentInstructions?: boolean;
}

export type View = 'landing' | 'auth' | 'dashboard' | 'invoices' | 'create-invoice' | 'customers' | 'settings' | 'upgrade';

export interface DashboardStats {
  totalInvoices: number;
  totalRevenue: number;
  unpaidCount: number;
  pendingAmount: number;
  paidCount: number;
  overdueCount: number;
}

export type CatalogItemType = 'service' | 'product';

export interface CatalogItem {
  id: string;
  type: CatalogItemType;
  name: string;
  description: string;
  unitPrice: number;
  currency: string;
  taxRate: number;          // percent, e.g. 7.5
  sku: string;
  unit: string;             // e.g. "Per project"
  trackInventory: boolean;
  stockQuantity?: number;   // only used when trackInventory is on
  active: boolean;          // available when creating invoices
  createdAt: string;
  updatedAt: string;
}