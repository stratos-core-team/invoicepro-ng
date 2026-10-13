import { Routes, Route, Navigate, useNavigate, useLocation, useParams } from "react-router-dom";
import type { Invoice, Customer, BusinessInfo, CatalogItem, View } from "@/types";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useState } from "react";
import { toast } from "sonner";
import { usePageTracking } from '@/hooks/usePageTracking';
import { ItemEditor } from "@/sections/ItemEditor";

import Home from "@/pages/Home";
import Auth from "@/pages/Auth";
import About from "@/pages/About";
import Contact from "@/pages/Contact";
import Feedback from "@/pages/Feedback";
import Upgrade from '@/pages/Upgrade';

import { Dashboard } from "@/sections/Dashboard";
import { InvoiceList } from "@/sections/InvoiceList";
import { CreateInvoice } from "@/sections/CreateInvoice";
import { PreviewSend } from "@/sections/PreviewSend";
import { CustomerList } from "@/sections/CustomerList";
import { Settings } from "@/sections/Settings";
import { More } from "@/sections/More";
import { BusinessBranding } from "@/sections/BusinessBranding";
import { ExportReport } from "@/sections/ExportReport";
import { Reports } from "@/sections/Reports";
import { Catalog } from "@/sections/Catalog";

import { BottomNav } from "@/components/BottomNav";
import type { NavView } from "@/components/BottomNav";
import { Header } from "@/components/Header";
import { Toaster } from "@/components/ui/sonner";
import { usePWAInstall } from "@/hooks/usePWAInstall";

import { trackEvent } from '@/utils/analytics';
import { EVENTS } from '@/analytics/events';

const DRAFT_KEY = 'invoicepro_invoice_draft';
function EditItemRoute({
  items,
  onSave,
  onCancel,
}: {
  items: CatalogItem[];
  onSave: (item: CatalogItem) => void;
  onCancel: () => void;
}) {
  const { id } = useParams();
  const item = items.find((i) => i.id === id);

  // Unknown or deleted item: nothing to edit
  if (!item) return <Navigate to="/products" replace />;

  return <ItemEditor key={item.id} item={item} items={items} onSave={onSave} onCancel={onCancel} />;
}

function App() {
  usePageTracking();

  const navigate = useNavigate();
  const location = useLocation();

  const publicPaths = ["/", "/auth", "/about", "/contact", "/feedback"];
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState('all');

  // Invoice waiting on the Preview & send page (not saved until it is sent)
  const [pendingInvoice, setPendingInvoice] = useState<Invoice | null>(null);

  const [invoices, setInvoices] = useLocalStorage<Invoice[]>("invoicepro_invoices", []);
  const [customers, setCustomers] = useLocalStorage<Customer[]>("invoicepro_customers", []);
  const [businessInfo, setBusinessInfo] = useLocalStorage<BusinessInfo>("invoicepro_business", {
    name: "My Business",
    address: "",
    phone: "",
    email: "",
  });
  const [catalog, setCatalog] = useLocalStorage<CatalogItem[]>("invoicepro_catalog", []);

  const isLoggedIn = !!localStorage.getItem("invoicepro_session");
  const { isInstallable, installApp } = usePWAInstall();

  // Show the app shell (header + sidebar + bottom nav) only on private pages
  const showShell = isLoggedIn && !publicPaths.includes(location.pathname);
  const currentView = (location.pathname.replace('/', '') || 'dashboard') as View;

  // These pages have their own sticky action bar, so the bottom nav is hidden there
  const hasOwnActionBar =
  ['/create-invoice', '/preview-send', '/business', '/export-report'].includes(location.pathname) ||
  location.pathname.startsWith('/item/');
  const showBottomNav = showShell && !hasOwnActionBar;

  // Invoices created this month (for the sidebar plan card and the More page)
  const now = new Date();
  const invoicesThisMonth = invoices.filter((inv) => {
    const d = new Date(inv.issueDate);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;

  // Only pass a name to the greeting once the user has set a real business name
  const displayName = businessInfo.name !== "My Business" ? businessInfo.name : undefined;

  // ================= ACTIONS =================
  const addInvoice = (invoice: Invoice) => {
    setInvoices((prev) => [invoice, ...prev]);
  };

  const handleSendInvoice = (invoice: Invoice) => {
    // Guard against saving the same invoice twice (e.g. browser back, then send again)
    if (!invoices.some((inv) => inv.id === invoice.id)) {
      addInvoice(invoice);
    }

    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }

    navigate('/invoices');
  };

  const deleteInvoice = (id: string) => {
    setInvoices((prev) => prev.filter((inv) => inv.id !== id));
  };

  const markAsPaid = (id: string) => {
    setInvoices((prev) =>
      prev.map((inv) =>
        inv.id === id
          ? { ...inv, status: "paid" as const, paidAt: new Date().toISOString() }
          : inv
      )
    );
  };

  const addCustomer = (customer: Customer) => {
    setCustomers((prev) => [customer, ...prev]);
  };

  const updateCustomer = (updatedCustomer: Customer) => {
    setCustomers((prev) =>
      prev.map((cust) => (cust.id === updatedCustomer.id ? updatedCustomer : cust))
    );
  };

  const deleteCustomer = (id: string) => {
    setCustomers((prev) => prev.filter((cust) => cust.id !== id));
  };

  const handleLogout = () => {
    trackEvent(EVENTS.USER_LOGGED_OUT, {
      current_path: location.pathname,
      invoices_count: invoices.length,
      customers_count: customers.length,
    });

    localStorage.removeItem("invoicepro_session");
    navigate("/");
  };

  const goToUpgrade = () => {
    trackEvent(EVENTS.UPGRADE_OPENED, {
      from: location.pathname,
    });
    navigate('/upgrade');
  };

  const handleBottomNavNavigate = (view: NavView) => {
    trackEvent(EVENTS.BOTTOM_NAV_CLICKED, {
      from: location.pathname.replace('/', '') || 'dashboard',
      to: view,
    });

    // Payments has no page yet
    if (view === 'payments') {
      toast.info('Payments is coming soon');
      return;
    }

    navigate(`/${view}`);
  };

  const handleSidebarNavigate = (view: View) => {
    trackEvent('sidebar_nav_clicked', {
      from: location.pathname.replace('/', '') || 'dashboard',
      to: view,
    });

    navigate(`/${view}`);
  };

  const handleInstallApp = () => {
    trackEvent(EVENTS.PWA_INSTALL_CLICKED, {
      current_path: location.pathname,
    });

    installApp();
  };
  const saveCatalogItem = (item: CatalogItem) => {
  setCatalog((prev) =>
    prev.some((i) => i.id === item.id)
      ? prev.map((i) => (i.id === item.id ? item : i))
      : [item, ...prev]
  );
  goBack('/products');
};

// Go back to wherever the user came from
const goBack = (fallback: string) => {
  if (window.history.length > 1) navigate(-1);
  else navigate(fallback);
};

  // ================= UI =================
  return (
    <div className="min-h-screen bg-gray-50 relative">
      {/* Header + desktop sidebar */}
      {showShell && (
        <Header
          businessName={businessInfo.name}
          onSettings={() => {
            trackEvent(EVENTS.SETTINGS_OPENED_FROM_HEADER, {
              from: location.pathname,
            });
            navigate("/settings");
          }}
          onLogout={handleLogout}
          onUpgrade={goToUpgrade}
          currentView={currentView}
          onNavigate={handleSidebarNavigate}
          userName={displayName}
          userEmail={businessInfo.email || undefined}
          invoiceCount={invoices.length}
          invoicesUsed={invoicesThisMonth}
          onSearch={(query) => {
            trackEvent('header_search_submitted', { query_length: query.length });
            navigate('/invoices');
          }}
        />
      )}

      {/* lg:pl-60 leaves room for the sidebar on desktop */}
      <main
        className={
          showShell
            ? `${showBottomNav ? 'pb-20' : ''} lg:pb-0 lg:pl-60`
            : ""
        }
      >
        <Routes>
          {/* Public */}
          <Route
            path="/"
            element={
              <Home
                onGetStarted={() => navigate("/auth?mode=signup")}
                onLogin={() => navigate("/auth")}
                onAbout={() => navigate("/about")}
                onContact={() => navigate("/contact")}
                onFeedback={() => navigate("/feedback")}
              />
            }
          />

          <Route
            path="/auth"
            element={
              <Auth
                onAuthSuccess={() => navigate("/dashboard")}
                onBack={() => navigate("/")}
              />
            }
          />

          <Route
            path="/about"
            element={<About onGetStarted={() => navigate("/auth")} />}
          />

          <Route path="/contact" element={<Contact />} />
          <Route path="/feedback" element={<Feedback />} />

          {/* Protected */}
          <Route
            path="/dashboard"
            element={
              isLoggedIn ? (
                <Dashboard
                  invoices={invoices}
                  userName={displayName}
                  onCreateInvoice={() => navigate('/create-invoice')}
                  onViewInvoices={() => navigate('/invoices')}
                  onViewCustomers={() => navigate('/customers')}
                  onViewInvoicesByStatus={(status) => {
                    setInvoiceStatusFilter(status);
                    navigate('/invoices');
                  }}
                  onExportReport={() => navigate('/export-report')}
                  onViewReports={() => navigate('/reports')}
                />
              ) : (
                <Navigate to="/" />
              )
            }
          />

          <Route
            path="/invoices"
            element={
              isLoggedIn ? (
                <InvoiceList
                  invoices={invoices}
                  businessInfo={businessInfo}
                  onMarkAsPaid={markAsPaid}
                  onDelete={deleteInvoice}
                  onCreateNew={() => navigate('/create-invoice')}
                  initialStatusFilter={invoiceStatusFilter}
                />
              ) : (
                <Navigate to="/" />
              )
            }
          />

          <Route
            path="/create-invoice"
            element={
              isLoggedIn ? (
                <CreateInvoice
                  customers={customers}
                  businessInfo={businessInfo}
                  invoiceCount={invoices.length}
                  onReview={(inv) => {
                    setPendingInvoice(inv);
                    navigate('/preview-send');
                  }}
                  onAddCustomer={addCustomer}
                  onCancel={() => navigate("/invoices")}
                />
              ) : (
                <Navigate to="/" />
              )
            }
          />

          <Route
            path="/preview-send"
            element={
              isLoggedIn ? (
                pendingInvoice ? (
                  <PreviewSend
                    invoice={pendingInvoice}
                    businessInfo={businessInfo}
                    onBack={() => navigate('/create-invoice')}
                    onSend={handleSendInvoice}
                  />
                ) : (
                  // Nothing to preview (e.g. page was refreshed): go back to the form, which restores its draft
                  <Navigate to="/create-invoice" replace />
                )
              ) : (
                <Navigate to="/" />
              )
            }
          />

          <Route
            path="/customers"
            element={
              isLoggedIn ? (
                <CustomerList
                  customers={customers}
                  invoices={invoices}
                  onAdd={addCustomer}
                  onUpdate={updateCustomer}
                  onDelete={deleteCustomer}
                />
              ) : (
                <Navigate to="/" />
              )
            }
          />

          <Route
            path="/more"
            element={
              isLoggedIn ? (
                <More
                  businessInfo={businessInfo}
                  invoicesUsed={invoicesThisMonth}
                  onSettings={() => navigate('/settings')}
                  onUpgrade={goToUpgrade}
                  onHelp={() => navigate('/contact')}
                  onFeedback={() => navigate('/feedback')}
                  onLogout={handleLogout}
                  onBusiness={() => navigate('/business')}
                  onReports={() => navigate('/reports')}
                  onProducts={() => navigate('/products')}
                  catalogCount={catalog.length}
                />
              ) : (
                <Navigate to="/" />
              )
            }
          />

          <Route
            path="/products"
            element={
              isLoggedIn ? (
                <Catalog
                  items={catalog}
                  onAdd={() => navigate('/item/new')}
                  onOpen={(item) => navigate(`/item/${item.id}`)}
                />
              ) : (
                <Navigate to="/" />
              )
            }
          />

          <Route
            path="/settings"
            element={
              isLoggedIn ? (
                <Settings
                  businessInfo={businessInfo}
                  onUpdate={setBusinessInfo}
                />
              ) : (
                <Navigate to="/" />
              )
            }
          />

            <Route
              path="/business"
              element={
                isLoggedIn ? (
                  <BusinessBranding
                    businessInfo={businessInfo}
                    onUpdate={setBusinessInfo}
                    onBack={() => navigate('/more')}
                  />
                ) : (
                  <Navigate to="/" />
                )
              }
            />

            <Route
              path="/item/new"
              element={
                isLoggedIn ? (
                  <ItemEditor
                    items={catalog}
                    onSave={saveCatalogItem}
                    onCancel={() => goBack('/products')}
                  />
                ) : (
                  <Navigate to="/" />
                )
              }
            />

            <Route
              path="/item/:id"
              element={
                isLoggedIn ? (
                  <EditItemRoute
                    items={catalog}
                    onSave={saveCatalogItem}
                    onCancel={() => goBack('/products')}
                  />
                ) : (
                  <Navigate to="/" />
                )
              }
            />

          <Route
            path="/export-report"
            element={
            isLoggedIn ? (
              <ExportReport
                invoices={invoices}
                customers={customers}
                businessInfo={businessInfo}
                onBack={() => (window.history.length > 1 ? navigate(-1) : navigate('/dashboard'))}
              />
            ) : (
            <Navigate to="/" />
            )
          }
        />

          <Route
            path="/reports"
            element={
              isLoggedIn ? (
                <Reports
                  invoices={invoices}
                  businessInfo={businessInfo}
                  onViewDetails={() => {
                    setInvoiceStatusFilter('overdue');
                    navigate('/invoices');
                  }}
                  onExport={() => navigate('/export-report')}
                />
              ) : (
                <Navigate to="/" />
              )
            }
          />

          <Route
            path="/upgrade"
            element={
              isLoggedIn ? (
                <Upgrade
                  onBack={() => navigate('/dashboard')}
                  onProceedToPayment={(plan) => {
                    trackEvent(EVENTS.UPGRADE_PAYMENT_STARTED, {
                      plan,
                      from: location.pathname,
                    });

                    console.log('Proceeding to payment:', plan);
                  }}
                />
              ) : (
                <Navigate to="/" />
              )
            }
          />
        </Routes>
      </main>

      {/* Install Button */}
      {isInstallable && (
        <div className="fixed bottom-24 lg:bottom-6 left-1/2 -translate-x-1/2 z-50">
          <button
            onClick={handleInstallApp}
            className="px-4 py-2 bg-green-600 text-white rounded-md shadow-md hover:bg-green-700 transition font-bold text-sm"
          >
            Install InvoicePro NG
          </button>
        </div>
      )}

      {/* Bottom Nav (mobile/tablet only; hidden on pages with their own action bar) */}
      {showBottomNav && (
        <BottomNav
          currentView={currentView}
          onNavigate={handleBottomNavNavigate}
        />
      )}

      <Toaster position="top-center" />
    </div>
  );
}

export default App;