export const EVENTS = {
  // generic
  PAGE_VIEWED: 'page_viewed',

  // public pages
  HOME_PAGE_VIEWED: 'home_page_viewed',
  AUTH_PAGE_VIEWED: 'auth_page_viewed',
  ABOUT_PAGE_VIEWED: 'about_page_viewed',
  CONTACT_PAGE_VIEWED: 'contact_page_viewed',
  FEEDBACK_PAGE_VIEWED: 'feedback_page_viewed',

  // app pages
  DASHBOARD_VIEWED: 'dashboard_viewed',
  INVOICES_PAGE_VIEWED: 'invoices_page_viewed',
  CREATE_INVOICE_PAGE_VIEWED: 'create_invoice_page_viewed',
  CLIENTS_PAGE_VIEWED: 'clients_page_viewed',
  SETTINGS_PAGE_VIEWED: 'settings_page_viewed',
  UPGRADE_PAGE_VIEWED: 'upgrade_page_viewed',

  // auth
  SIGNUP_STARTED: 'signup_started',
  SIGNUP_COMPLETED: 'signup_completed',
  SIGNIN_COMPLETED: 'signin_completed',
  AUTH_FAILED: 'auth_failed',

  // two-factor auth
  TWO_FA_SETUP_STARTED: 'two_fa_setup_started',
  TWO_FA_SETUP_COMPLETED: 'two_fa_setup_completed',
  TWO_FA_VERIFY_PROMPTED: 'two_fa_verify_prompted',
  TWO_FA_VERIFY_SUCCEEDED: 'two_fa_verify_succeeded',
  TWO_FA_VERIFY_FAILED: 'two_fa_verify_failed',
  TWO_FA_CANCELLED: 'two_fa_cancelled',

  // app / shell / navigation
  USER_LOGGED_OUT: 'user_logged_out',
  BOTTOM_NAV_CLICKED: 'bottom_nav_clicked',
  PWA_INSTALL_CLICKED: 'pwa_install_clicked',
  SETTINGS_OPENED_FROM_HEADER: 'settings_opened_from_header',
  UPGRADE_OPENED: 'upgrade_opened',
  UPGRADE_PAYMENT_STARTED: 'upgrade_payment_started',

  // dashboard actions
  DASHBOARD_CREATE_INVOICE_CLICKED: 'dashboard_create_invoice_clicked',
  DASHBOARD_VIEW_INVOICES_CLICKED: 'dashboard_view_invoices_clicked',
  DASHBOARD_VIEW_CUSTOMERS_CLICKED: 'dashboard_view_customers_clicked',
  DASHBOARD_STATUS_CARD_CLICKED: 'dashboard_status_card_clicked',

  // invoice flow
  CREATE_INVOICE_CLICKED: 'create_invoice_clicked',
  INVOICE_FORM_STARTED: 'invoice_form_started',
  INVOICE_CREATED: 'invoice_created',
  INVOICE_SAVED_DRAFT: 'invoice_saved_draft',
  INVOICE_UPDATED: 'invoice_updated',
  INVOICE_SENT: 'invoice_sent',
  INVOICE_DOWNLOADED_PDF: 'invoice_downloaded',
  INVOICE_MARKED_PAID: 'invoice_marked_paid',
  INVOICE_DELETED: 'invoice_deleted',
  INVOICE_CREATION_FAILED: 'invoice_creation_failed',

  // invoice list / invoice actions
  INVOICE_VIEWED: 'invoice_viewed',
  INVOICE_SEARCH_USED: 'invoice_search_used',
  INVOICE_FILTER_CHANGED: 'invoice_filter_used',

  // client flow
  CLIENT_FORM_OPENED: 'client_form_opened',
  CLIENT_CREATED: 'client_created',
  CLIENT_UPDATED: 'client_updated',
  CLIENT_DELETED: 'client_deleted',
  CLIENT_SEARCH_USED: 'client_search_used',

  // settings / business
  BUSINESS_PROFILE_UPDATED: 'business_profile_updated',
  SETTINGS_CANCEL_CLICKED: 'settings_cancel_clicked',
} as const;