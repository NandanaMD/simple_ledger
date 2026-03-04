import { useEffect, useMemo, useState } from 'react';
import type { AccountWithBalance, Category, LedgerTransaction, TransactionType } from '../../shared/types/ledger';
import styles from './LedgerPage.module.css';

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

type ReportPeriodFilter = 'THIS_MONTH' | 'LAST_3_MONTHS' | 'THIS_YEAR' | 'ALL';
type ReportTypeFilter = 'ALL' | TransactionType;
type CategoryFilter = 'ALL' | 'UNCATEGORIZED' | `CATEGORY:${number}`;
type BankFilter = 'ALL' | number;

interface CategoryFilterOption {
  value: CategoryFilter;
  label: string;
}

interface CategoryFilterGroup {
  groupLabel: string;
  options: CategoryFilterOption[];
}

const periodLabels: Record<ReportPeriodFilter, string> = {
  THIS_MONTH: 'This Month',
  LAST_3_MONTHS: 'Last 3 Months',
  THIS_YEAR: 'This Year',
  ALL: 'All Time',
};

const typeLabels: Record<ReportTypeFilter, string> = {
  ALL: 'All Types',
  INCOME: 'Income',
  EXPENSE: 'Expense',
  TRANSFER: 'Transfer',
};

const startOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

const startOfMonth = (value: Date) => new Date(value.getFullYear(), value.getMonth(), 1);
const startOfYear = (value: Date) => new Date(value.getFullYear(), 0, 1);

const isWithinSelectedPeriod = (dateString: string, period: ReportPeriodFilter): boolean => {
  if (period === 'ALL') {
    return true;
  }

  const entryDate = new Date(`${dateString}T00:00:00`);
  const today = startOfToday();

  if (period === 'THIS_MONTH') {
    return entryDate >= startOfMonth(today);
  }

  if (period === 'LAST_3_MONTHS') {
    return entryDate >= new Date(today.getFullYear(), today.getMonth() - 2, 1);
  }

  return entryDate >= startOfYear(today);
};

const amountClassByType = (type: TransactionType): string => {
  if (type === 'INCOME') {
    return styles.reportAmountIncome;
  }
  if (type === 'EXPENSE') {
    return styles.reportAmountExpense;
  }
  return styles.reportAmountTransfer;
};

const signedAmount = (type: TransactionType, amount: number): string => {
  if (type === 'INCOME') {
    return `+ ${currency.format(amount)}`;
  }
  if (type === 'EXPENSE') {
    return `- ${currency.format(amount)}`;
  }
  return currency.format(amount);
};

export const ReportsPage = () => {
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [transactions, setTransactions] = useState<LedgerTransaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [periodFilter, setPeriodFilter] = useState<ReportPeriodFilter>('THIS_MONTH');
  const [typeFilter, setTypeFilter] = useState<ReportTypeFilter>('ALL');
  const [bankFilter, setBankFilter] = useState<BankFilter>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('ALL');
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => setToast(''), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const loadTransactions = async () => {
    try {
      const [accountData, transactionData, categoryData] = await Promise.all([
        window.api.listAccounts(),
        window.api.listTransactions(),
        window.api.listCategories(),
      ]);
      setAccounts(accountData);
      setTransactions(transactionData);
      setCategories(categoryData);
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Unable to load reports right now.');
    }
  };

  useEffect(() => {
    void loadTransactions();
  }, []);

  const bankAccounts = useMemo(
    () => accounts.filter((account) => account.accountType === 'BANK'),
    [accounts],
  );

  useEffect(() => {
    if (bankFilter === 'ALL') {
      return;
    }

    if (!bankAccounts.some((account) => account.id === bankFilter)) {
      setBankFilter('ALL');
    }
  }, [bankAccounts, bankFilter]);

  const transactionsByPeriodAndType = useMemo(() => {
    const filtered = transactions.filter((entry) => {
      if (!isWithinSelectedPeriod(entry.transactionDate, periodFilter)) {
        return false;
      }

      if (typeFilter !== 'ALL' && entry.transactionType !== typeFilter) {
        return false;
      }

      if (bankFilter !== 'ALL') {
        const isSourceMatch = entry.accountId === bankFilter;
        const isDestinationMatch = entry.toAccountId === bankFilter;
        if (!isSourceMatch && !isDestinationMatch) {
          return false;
        }
      }

      return true;
    });

    filtered.sort((left, right) => {
      const dateComparison = right.transactionDate.localeCompare(left.transactionDate);
      if (dateComparison !== 0) {
        return dateComparison;
      }
      return right.id - left.id;
    });

    return filtered;
  }, [bankFilter, periodFilter, transactions, typeFilter]);

  const categoryFilterGroups = useMemo<CategoryFilterGroup[]>(() => {
    const typeFilteredCategories =
      typeFilter === 'ALL'
        ? categories
        : categories.filter((category) => (typeFilter === 'TRANSFER' ? false : category.categoryType === typeFilter));

    const parentCategories = typeFilteredCategories
      .filter((category) => category.parentId === null)
      .slice()
      .sort((left, right) => left.name.localeCompare(right.name));

    const childrenByParent = new Map<number, Category[]>();
    typeFilteredCategories
      .filter((category) => category.parentId !== null)
      .forEach((category) => {
        const parentId = category.parentId as number;
        const current = childrenByParent.get(parentId) ?? [];
        current.push(category);
        childrenByParent.set(parentId, current);
      });

    childrenByParent.forEach((children) => {
      children.sort((left, right) => left.name.localeCompare(right.name));
    });

    const groups: CategoryFilterGroup[] = [];

    parentCategories.forEach((parent) => {
      const children = childrenByParent.get(parent.id) ?? [];
      groups.push({
        groupLabel: parent.name,
        options: [{ value: `CATEGORY:${parent.id}`, label: `All in ${parent.name}` }, ...children.map((child) => ({
          value: `CATEGORY:${child.id}` as const,
          label: child.name,
        }))],
      });
    });

    const remainingChildren = typeFilteredCategories
      .filter(
        (category) =>
          category.parentId !== null && !parentCategories.some((parentCategory) => parentCategory.id === category.parentId),
      )
      .slice()
      .sort((left, right) => left.name.localeCompare(right.name));

    if (remainingChildren.length > 0) {
      groups.push({
        groupLabel: 'Other',
        options: remainingChildren.map((child) => ({ value: `CATEGORY:${child.id}`, label: child.name })),
      });
    }

    return groups;
  }, [categories, typeFilter]);

  const categoryOptions = useMemo<CategoryFilterOption[]>(() => {
    const options: CategoryFilterOption[] = [
      { value: 'ALL', label: 'All Categories' },
      { value: 'UNCATEGORIZED', label: 'No category assigned' },
    ];

    categoryFilterGroups.forEach((group) => {
      options.push(...group.options);
    });

    return options;
  }, [categoryFilterGroups]);

  useEffect(() => {
    const availableValues = new Set(categoryOptions.map((option) => option.value));
    if (!availableValues.has(categoryFilter)) {
      setCategoryFilter('ALL');
    }
  }, [categoryFilter, categoryOptions]);

  const categoryScopeIds = useMemo(() => {
    if (!categoryFilter.startsWith('CATEGORY:')) {
      return new Set<number>();
    }

    const selectedId = Number(categoryFilter.replace('CATEGORY:', ''));
    if (!Number.isFinite(selectedId)) {
      return new Set<number>();
    }

    const scope = new Set<number>([selectedId]);
    categories.forEach((category) => {
      if (category.parentId === selectedId) {
        scope.add(category.id);
      }
    });

    return scope;
  }, [categories, categoryFilter]);

  const filteredTransactions = useMemo(() => {
    if (categoryFilter === 'ALL') {
      return transactionsByPeriodAndType;
    }

    if (categoryFilter === 'UNCATEGORIZED') {
      return transactionsByPeriodAndType.filter((entry) => entry.categoryId === null);
    }

    return transactionsByPeriodAndType.filter(
      (entry) => entry.categoryId !== null && categoryScopeIds.has(entry.categoryId),
    );
  }, [categoryFilter, categoryScopeIds, transactionsByPeriodAndType]);

  const summary = useMemo(() => {
    return filteredTransactions.reduce(
      (accumulator, entry) => {
        if (entry.transactionType === 'INCOME') {
          accumulator.income += entry.amount;
        } else if (entry.transactionType === 'EXPENSE') {
          accumulator.expense += entry.amount;
        } else {
          accumulator.transfer += entry.amount;
        }
        return accumulator;
      },
      { income: 0, expense: 0, transfer: 0 },
    );
  }, [filteredTransactions]);

  const resetFilters = () => {
    setPeriodFilter('THIS_MONTH');
    setTypeFilter('ALL');
    setBankFilter('ALL');
    setCategoryFilter('ALL');
  };

  const activeFiltersCount =
    Number(periodFilter !== 'THIS_MONTH') + Number(typeFilter !== 'ALL') + Number(bankFilter !== 'ALL') + Number(categoryFilter !== 'ALL');

  return (
    <div className={styles.sectionGrid}>
      <article className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2 className={styles.panelTitle}>Reports</h2>
          <button type="button" className={styles.button} onClick={resetFilters}>
            Reset Filters
          </button>
        </div>

        <p className={styles.panelText}>Simple overview for daily review and decision-making.</p>

        <div className={styles.reportFiltersGrid}>
          <label className={styles.reportFilterField}>
            <span className={styles.reportFilterLabel}>Period</span>
            <select
              className={`${styles.reportFilterSelect} ${periodFilter !== 'THIS_MONTH' ? styles.reportFilterSelectActive : ''}`}
              value={periodFilter}
              onChange={(event) => setPeriodFilter(event.target.value as ReportPeriodFilter)}
              aria-label="Filter by period"
              title="Filter by period"
            >
              {(['THIS_MONTH', 'LAST_3_MONTHS', 'THIS_YEAR', 'ALL'] as ReportPeriodFilter[]).map((period) => (
                <option key={period} value={period}>
                  {periodLabels[period]}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.reportFilterField}>
            <span className={styles.reportFilterLabel}>Type</span>
            <select
              className={`${styles.reportFilterSelect} ${typeFilter !== 'ALL' ? styles.reportFilterSelectActive : ''}`}
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as ReportTypeFilter)}
              aria-label="Filter by type"
              title="Filter by type"
            >
              {(['ALL', 'INCOME', 'EXPENSE', 'TRANSFER'] as ReportTypeFilter[]).map((type) => (
                <option key={type} value={type}>
                  {typeLabels[type]}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.reportFilterField}>
            <span className={styles.reportFilterLabel}>Bank</span>
            <select
              className={`${styles.reportFilterSelect} ${bankFilter !== 'ALL' ? styles.reportFilterSelectActive : ''}`}
              value={bankFilter}
              onChange={(event) => {
                const value = event.target.value;
                setBankFilter(value === 'ALL' ? 'ALL' : Number(value));
              }}
              aria-label="Filter by bank"
              title="Filter by bank"
            >
              <option value="ALL">All Banks</option>
              {bankAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.reportFilterField}>
            <span className={styles.reportFilterLabel}>Category</span>
            <select
              className={`${styles.reportFilterSelect} ${categoryFilter !== 'ALL' ? styles.reportFilterSelectActive : ''}`}
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value as CategoryFilter)}
              aria-label="Filter by category"
              title="Filter by category"
            >
              <option value="ALL">All Categories</option>
              <option value="UNCATEGORIZED">No category assigned</option>
              {categoryFilterGroups.map((group) => (
                <optgroup key={group.groupLabel} label={group.groupLabel}>
                  {group.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        </div>

        <p className={styles.valueHint}>Active filters: {activeFiltersCount} | Records: {filteredTransactions.length}</p>

        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Total Income</p>
            <p className={`${styles.summaryValue} ${styles.amountPositive}`}>{currency.format(summary.income)}</p>
          </div>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Total Expense</p>
            <p className={`${styles.summaryValue} ${styles.amountNegative}`}>{currency.format(summary.expense)}</p>
          </div>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Total Transfer</p>
            <p className={styles.summaryValue}>{currency.format(summary.transfer)}</p>
          </div>
        </div>
      </article>

      <article className={styles.panel}>
        <h2 className={styles.panelTitle}>Transaction Report</h2>
        <p className={styles.panelText}>One clear table with all details. Use filters above to narrow results.</p>

        <div className={styles.tableWrapTall}>
          <table className={`${styles.table} ${styles.reportTable}`}>
            <thead className={styles.tableHeadSticky}>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Account</th>
                <th>Category</th>
                <th>Note</th>
                <th className={styles.numberCell}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.map((entry) => (
                <tr key={entry.id} className={styles.reportTableRow}>
                  <td>{entry.transactionDate}</td>
                  <td>
                    <span
                      className={`${styles.reportTypePill} ${
                        entry.transactionType === 'INCOME'
                          ? styles.reportTypePillIncome
                          : entry.transactionType === 'EXPENSE'
                            ? styles.reportTypePillExpense
                            : styles.reportTypePillTransfer
                      }`}
                    >
                      {entry.transactionType}
                    </span>
                  </td>
                  <td>
                    {entry.transactionType === 'TRANSFER' && entry.toAccountName
                      ? `${entry.accountName} → ${entry.toAccountName}`
                      : entry.accountName}
                  </td>
                  <td>{entry.categoryName ?? '-'}</td>
                  <td className={styles.reportNoteCell}>{entry.note?.trim() || '-'}</td>
                  <td className={`${styles.numberCell} ${amountClassByType(entry.transactionType)}`}>
                    {signedAmount(entry.transactionType, entry.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!filteredTransactions.length ? <p className={styles.emptyText}>No transactions for selected filters.</p> : null}
      </article>

      {toast ? <div className={styles.toast}>{toast}</div> : null}
    </div>
  );
};
