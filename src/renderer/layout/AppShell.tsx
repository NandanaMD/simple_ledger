import { useMemo, useState } from 'react';
import type { ModuleKey } from '../../shared/types/navigation';
import styles from './AppShell.module.css';
import { AccountsPage } from '../pages/AccountsPage';
import { CategoriesPage } from '../pages/CategoriesPage';
import { DashboardPage } from '../pages/DashboardPage';
import { ExportPage } from '../pages/ExportPage';
import { LabourPage } from '../pages/LabourPage';
import { LabourRecordsPage } from '../pages/LabourRecordsPage';
import { ReportsPage } from '../pages/ReportsPage';
import { TransactionsPage } from '../pages/TransactionsPage';
import { UpdatesPage } from '../pages/UpdatesPage.tsx';

interface NavItem {
  key: ModuleKey;
  label: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: 'Overview',
    items: [{ key: 'dashboard', label: 'Dashboard' }],
  },
  {
    title: 'Money',
    items: [
      { key: 'accounts', label: 'Accounts' },
      { key: 'transactions', label: 'Transactions' },
      { key: 'categories', label: 'Categories' },
    ],
  },
  {
    title: 'Labour',
    items: [
      { key: 'labour', label: 'Labour' },
      { key: 'labour-records', label: 'Labour Records' },
    ],
  },
  {
    title: 'Reports',
    items: [
      { key: 'reports', label: 'Reports' },
      { key: 'export', label: 'Export' },
      { key: 'updates', label: 'Check for Update' },
    ],
  },
];

const titles: Record<ModuleKey, string> = {
  dashboard: 'Dashboard',
  accounts: 'Accounts',
  labour: 'Labour Management',
  'labour-records': 'Labour Records',
  categories: 'Categories',
  transactions: 'Transactions',
  reports: 'Reports',
  export: 'Export',
  updates: 'Check for Update',
};

const renderPage = (moduleKey: ModuleKey) => {
  switch (moduleKey) {
    case 'dashboard':
      return <DashboardPage />;
    case 'accounts':
      return <AccountsPage />;
    case 'labour':
      return <LabourPage />;
    case 'labour-records':
      return <LabourRecordsPage />;
    case 'categories':
      return <CategoriesPage />;
    case 'transactions':
      return <TransactionsPage />;
    case 'reports':
      return <ReportsPage />;
    case 'export':
      return <ExportPage />;
    case 'updates':
      return <UpdatesPage />;
    default:
      return <DashboardPage />;
  }
};

export const AppShell = () => {
  const [activeModule, setActiveModule] = useState<ModuleKey>('dashboard');
  const activeTitle = useMemo(() => titles[activeModule], [activeModule]);

  return (
    <div className={styles.appContainer}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>Simple Ledger</div>
        <nav className={styles.navList}>
          {navSections.map((section) => (
            <div key={section.title} className={styles.navSection}>
              <p className={styles.navSectionTitle}>{section.title}</p>
              <div className={styles.navSectionItems}>
                {section.items.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`${styles.navButton} ${
                      item.key === activeModule ? styles.navButtonActive : ''
                    }`}
                    onClick={() => setActiveModule(item.key)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <main className={styles.mainArea}>
        <header className={styles.header}>
          <h1 className={styles.pageTitle}>{activeTitle}</h1>
          <p className={styles.pageSubTitle}>Simple Ledger</p>
        </header>

        <section className={styles.contentArea}>{renderPage(activeModule)}</section>
      </main>
    </div>
  );
};
