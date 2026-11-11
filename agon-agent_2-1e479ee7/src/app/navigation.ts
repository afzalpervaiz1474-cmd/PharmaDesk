import {
  ChartColumn,
  LayoutDashboard,
  MessageSquareText,
  PackagePlus,
  Pill,
  Receipt,
  Settings,
  Truck,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export const APP_VERSION = '0.1.0';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** True for modules that are designed but not built yet. */
  planned?: boolean;
  /** Match the path exactly (used for the dashboard and inventory list). */
  end?: boolean;
}

export interface NavGroup {
  heading: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    heading: 'Overview',
    items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true }],
  },
  {
    heading: 'Inventory',
    items: [
      { to: '/inventory', label: 'Medicines', icon: Pill, end: true },
      { to: '/inventory/new', label: 'Register medicine', icon: PackagePlus },
    ],
  },
  {
    heading: 'Operations',
    items: [
      { to: '/planned/sales', label: 'Sales & billing', icon: Receipt, planned: true },
      { to: '/planned/purchases', label: 'Purchases', icon: Truck, planned: true },
      { to: '/planned/expenses', label: 'Expenses', icon: Wallet, planned: true },
      { to: '/planned/reports', label: 'Reports', icon: ChartColumn, planned: true },
    ],
  },
  {
    heading: 'Tools',
    items: [
      { to: '/assistant', label: 'Assistant', icon: MessageSquareText },
      { to: '/settings', label: 'Sync & settings', icon: Settings },
    ],
  },
];

export interface PlannedModule {
  id: string;
  title: string;
  icon: LucideIcon;
  phase: string;
  summary: string;
  scope: string[];
  dependsOn: string;
}

/** Product copy for modules on the roadmap. Mirrors ROADMAP.md. */
export const PLANNED_MODULES: PlannedModule[] = [
  {
    id: 'sales',
    title: 'Sales & billing',
    icon: Receipt,
    phase: 'Phase 2',
    summary: 'Sell from stock at the counter and print a bill, even with no internet connection.',
    scope: [
      'Counter sale screen with barcode and name search',
      'Automatic batch selection, earliest expiry first, never from expired batches',
      'Stock deducted per batch in the same local transaction as the sale',
      'Printable invoice with tax lines and discounts',
      'Sale returns that put stock back into the original batch',
    ],
    dependsOn: 'Requires atomic stock movements in the local database, which are not built yet.',
  },
  {
    id: 'purchases',
    title: 'Purchases & suppliers',
    icon: Truck,
    phase: 'Phase 2',
    summary: 'Record supplier invoices so new batches enter stock with their real purchase cost.',
    scope: [
      'Supplier directory with contact and licence details',
      'Purchase entry that creates batches with cost, selling price and expiry',
      'Outstanding payables per supplier',
      'Purchase returns for expired or damaged stock',
    ],
    dependsOn: 'Today batches are entered by hand on the medicine screen.',
  },
  {
    id: 'expenses',
    title: 'Expenses',
    icon: Wallet,
    phase: 'Phase 3',
    summary: 'Track rent, salaries, electricity and other running costs of the store.',
    scope: [
      'Expense categories and recurring expenses',
      'Daily expense entry with notes',
      'Monthly expense totals feeding the net profit calculation',
    ],
    dependsOn: 'Independent of sales, but only useful for profit once sales exist.',
  },
  {
    id: 'reports',
    title: 'Reports',
    icon: ChartColumn,
    phase: 'Phase 3',
    summary: 'Daily, weekly and monthly views of sales, gross profit and net profit.',
    scope: [
      'Sales and gross profit by day, week and month',
      'Net profit after expenses',
      'Fast-moving and slow-moving medicines',
      'Expiry loss report',
      'Export to CSV and PDF',
    ],
    dependsOn: 'Needs recorded sales, purchases and expenses. No figures can be shown before then.',
  },
];
