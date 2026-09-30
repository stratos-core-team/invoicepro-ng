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
  logo?: string;
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
