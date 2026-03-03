import { type FormEvent, useEffect, useMemo, useState } from 'react';
import type {
  AccountWithBalance,
  Category,
  CategoryType,
  LedgerTransaction,
  TransactionInput,
  TransactionType,
} from '../../shared/types/ledger';
import styles from './LedgerPage.module.css';

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

const today = new Date().toISOString().slice(0, 10);

const monthLabelFormatter = new Intl.DateTimeFormat('en-IN', {
  month: 'short',
  year: 'numeric',
});

const defaultForm: TransactionInput = {
  transactionType: 'EXPENSE',
  accountId: 0,
  toAccountId: 0,
  amount: 0,
  transactionDate: today,
  note: '',
};

type TransactionSort = 'date' | 'amount' | 'type';
type TransactionTypeFilter = 'ALL' | TransactionType;

const toMonthKey = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const currentMonthKey = toMonthKey(new Date());

const toFriendlyErrorMessage = (error: unknown, fallback: string) => {
  if (!(error instanceof Error)) {
    return fallback;
  }

  const normalizedMessage = error.message
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .trim();

  const lowerMessage = normalizedMessage.toLowerCase();
  if (lowerMessage.includes('insufficient balance')) {
    return 'Not enough balance in the selected source account.';
  }
  if (lowerMessage.includes('source account is required')) {
    return 'Please select a source account.';
  }
  if (lowerMessage.includes('amount must be greater than zero')) {
    return 'Amount should be greater than zero.';
  }
  if (lowerMessage.includes('transfer requires a different destination account')) {
    return 'Choose a different destination account for transfer.';
  }
  if (lowerMessage.includes('selected category type does not match')) {
    return 'Selected category does not match transaction type.';
  }

  return normalizedMessage || fallback;
};

export const TransactionsPage = () => {
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<LedgerTransaction[]>([]);
  const [form, setForm] = useState<TransactionInput>(defaultForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [filterText, setFilterText] = useState('');
  const [typeFilter, setTypeFilter] = useState<TransactionTypeFilter>('ALL');
  const [accountFilter, setAccountFilter] = useState<number | 'ALL'>('ALL');
  const [monthKey, setMonthKey] = useState(currentMonthKey);
  const [sortBy, setSortBy] = useState<TransactionSort>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [toast, setToast] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [showCategoryCreateModal, setShowCategoryCreateModal] = useState(false);
  const [categoryCreateType, setCategoryCreateType] = useState<CategoryType>('EXPENSE');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newSubcategoryName, setNewSubcategoryName] = useState('');

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(''), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const loadData = async () => {
    try {
      const [accountData, categoryData, transactionData] = await Promise.all([
        window.api.listAccounts(),
        window.api.listCategories(),
        window.api.listTransactions(),
      ]);
      setAccounts(accountData);
      setCategories(categoryData);
      setTransactions(transactionData);
      if (!form.accountId && accountData.length > 0) {
        setForm((previous) => ({ ...previous, accountId: accountData[0].id }));
      }
    } catch (loadError) {
      setToast(toFriendlyErrorMessage(loadError, 'Unable to load transactions right now.'));
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const visibleTransactions = useMemo(() => {
    const keyword = filterText.trim().toLowerCase();
    const filtered = transactions.filter((entry) => {
      if (!entry.transactionDate.startsWith(monthKey)) {
        return false;
      }
      if (typeFilter !== 'ALL' && entry.transactionType !== typeFilter) {
        return false;
      }
      if (accountFilter !== 'ALL' && entry.accountId !== accountFilter && entry.toAccountId !== accountFilter) {
        return false;
      }
      if (!keyword) {
        return true;
      }
      return (
        entry.transactionType.toLowerCase().includes(keyword) ||
        entry.accountName.toLowerCase().includes(keyword) ||
        (entry.toAccountName ?? '').toLowerCase().includes(keyword) ||
        (entry.categoryName ?? '').toLowerCase().includes(keyword) ||
        (entry.note ?? '').toLowerCase().includes(keyword)
      );
    });

    filtered.sort((left, right) => {
      let compare = 0;
      if (sortBy === 'date') {
        compare = left.transactionDate.localeCompare(right.transactionDate);
      } else if (sortBy === 'amount') {
        compare = left.amount - right.amount;
      } else {
        compare = left.transactionType.localeCompare(right.transactionType);
      }

      return sortDirection === 'asc' ? compare : -compare;
    });

    return filtered;
  }, [accountFilter, filterText, monthKey, sortBy, sortDirection, transactions, typeFilter]);

  const summaries = useMemo(() => {
    return visibleTransactions.reduce(
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
  }, [visibleTransactions]);

  const resetForm = () => {
    setEditingId(null);
    setForm((previous) => ({
      ...defaultForm,
      accountId: accounts[0]?.id ?? previous.accountId,
      categoryId: undefined,
      transactionDate: today,
    }));
  };

  const openCreateModal = () => {
    resetForm();
    setShowTransactionModal(true);
  };

  const openCategoryCreateModal = () => {
    setCategoryCreateType(form.transactionType === 'INCOME' ? 'INCOME' : 'EXPENSE');
    setNewCategoryName('');
    setNewSubcategoryName('');
    setShowCategoryCreateModal(true);
  };

  const submitCategoryCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const categoryName = newCategoryName.trim();
      const subcategoryName = newSubcategoryName.trim();

      if (!categoryName) {
        throw new Error('Category name is required.');
      }

      const parentCategory = await window.api.createCategory({
        name: categoryName,
        categoryType: categoryCreateType,
      });

      const selectedCategory = subcategoryName
        ? await window.api.createCategory({
            name: subcategoryName,
            categoryType: categoryCreateType,
            parentId: parentCategory.id,
          })
        : parentCategory;

      setForm((previous) => ({
        ...previous,
        transactionType: categoryCreateType === 'INCOME' ? 'INCOME' : 'EXPENSE',
        categoryId: selectedCategory.id,
      }));

      setShowCategoryCreateModal(false);
      setNewCategoryName('');
      setNewSubcategoryName('');
      await loadData();
    } catch (error) {
      setToast(toFriendlyErrorMessage(error, 'Unable to create category right now.'));
    }
  };

  const submitTransaction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      if (!form.accountId) {
        throw new Error('Source account is required.');
      }
      if (form.transactionType === 'TRANSFER' && (!form.toAccountId || form.toAccountId === form.accountId)) {
        throw new Error('Transfer requires a different destination account.');
      }
      if (!Number.isFinite(form.amount) || form.amount <= 0) {
        throw new Error('Amount must be greater than zero.');
      }

      const categorySelect = event.currentTarget.elements.namedItem('categoryId') as HTMLSelectElement | null;
      const selectedCategoryId = categorySelect ? Number(categorySelect.value) : Number(form.categoryId ?? 0);

      const normalizedCategoryId =
        form.transactionType === 'TRANSFER'
          ? undefined
          : Number.isFinite(selectedCategoryId) && selectedCategoryId > 0
            ? selectedCategoryId
            : undefined;

      const payload: TransactionInput = {
        ...form,
        amount: Number(form.amount),
        note: form.note?.trim() ?? '',
        toAccountId: form.transactionType === 'TRANSFER' ? form.toAccountId : 0,
        categoryId: normalizedCategoryId,
      };

      if (editingId === null) {
        await window.api.createTransaction(payload);
      } else {
        await window.api.updateTransaction(editingId, payload);
      }

      resetForm();
      setShowTransactionModal(false);
      await loadData();
    } catch (submitError) {
      setToast(toFriendlyErrorMessage(submitError, 'Unable to save this transaction.'));
    }
  };

  const editTransaction = (entry: LedgerTransaction) => {
    setEditingId(entry.id);
    setForm({
      transactionType: entry.transactionType,
      accountId: entry.accountId,
      toAccountId: entry.toAccountId ?? 0,
      categoryId: entry.categoryId ?? undefined,
      amount: entry.amount,
      transactionDate: entry.transactionDate,
      note: entry.note ?? '',
    });
    setShowTransactionModal(true);
  };

  const removeTransaction = async (id: number) => {
    try {
      await window.api.deleteTransaction(id);
      await loadData();
      if (editingId === id) {
        resetForm();
      }
    } catch (deleteError) {
      setToast(toFriendlyErrorMessage(deleteError, 'Unable to delete this transaction.'));
    }
  };

  const clearFilters = () => {
    setFilterText('');
    setTypeFilter('ALL');
    setAccountFilter('ALL');
    setMonthKey(currentMonthKey);
    setSortBy('date');
    setSortDirection('desc');
  };

  const shiftMonth = (delta: number) => {
    const selectedDate = new Date(`${monthKey}-01T00:00:00`);
    const shiftedDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + delta, 1);
    setMonthKey(toMonthKey(shiftedDate));
  };

  const monthOptions = useMemo(() => {
    const seed = new Date();
    seed.setDate(1);
    const options: { key: string; label: string }[] = [];
    for (let offset = -18; offset <= 6; offset += 1) {
      const current = new Date(seed.getFullYear(), seed.getMonth() + offset, 1);
      options.push({ key: toMonthKey(current), label: monthLabelFormatter.format(current) });
    }
    if (!options.some((option) => option.key === monthKey)) {
      const selectedDate = new Date(`${monthKey}-01T00:00:00`);
      options.push({ key: monthKey, label: monthLabelFormatter.format(selectedDate) });
      options.sort((left, right) => left.key.localeCompare(right.key));
    }
    return options;
  }, [monthKey]);

  const accountFilterName =
    accountFilter === 'ALL' ? 'All Accounts' : (accounts.find((account) => account.id === accountFilter)?.name ?? '');

  const categoryOptions = useMemo(
    () =>
      categories
        .slice()
        .sort((left, right) => {
          if (left.categoryType !== right.categoryType) {
            return left.categoryType.localeCompare(right.categoryType);
          }
          return left.name.localeCompare(right.name);
        }),
    [categories],
  );

  const categoryById = useMemo(() => {
    const map = new Map<number, Category>();
    categoryOptions.forEach((category) => {
      map.set(category.id, category);
    });
    return map;
  }, [categoryOptions]);

  const categoryOptionsForSelectedType = useMemo(() => {
    if (form.transactionType === 'TRANSFER') {
      return [] as Category[];
    }
    return categoryOptions.filter((category) => category.categoryType === form.transactionType);
  }, [categoryOptions, form.transactionType]);

  const recentCategoriesForSelectedType = useMemo(() => {
    if (form.transactionType === 'TRANSFER') {
      return [] as Category[];
    }

    const collected: Category[] = [];
    const seen = new Set<number>();
    const sorted = transactions
      .slice()
      .sort((left, right) => right.transactionDate.localeCompare(left.transactionDate) || right.id - left.id);

    sorted.forEach((entry) => {
      if (entry.transactionType !== form.transactionType || !entry.categoryId || seen.has(entry.categoryId)) {
        return;
      }

      const category = categoryById.get(entry.categoryId);
      if (!category || category.categoryType !== form.transactionType) {
        return;
      }

      seen.add(entry.categoryId);
      collected.push(category);
    });

    return collected.slice(0, 5);
  }, [categoryById, form.transactionType, transactions]);

  const groupedCategoryOptionsForSelectedType = useMemo(() => {
    if (form.transactionType === 'TRANSFER') {
      return [] as { groupLabel: string; options: { id: number; label: string }[] }[];
    }

    const parents = categoryOptionsForSelectedType.filter((category) => category.parentId === null);
    const childrenByParent = new Map<number, Category[]>();

    categoryOptionsForSelectedType
      .filter((category) => category.parentId !== null)
      .forEach((category) => {
        const parentId = category.parentId as number;
        const current = childrenByParent.get(parentId) ?? [];
        current.push(category);
        childrenByParent.set(parentId, current);
      });

    return parents.map((parent) => {
      const children = (childrenByParent.get(parent.id) ?? []).slice().sort((left, right) => left.name.localeCompare(right.name));
      return {
        groupLabel: parent.name,
        options:
          children.length > 0
            ? children.map((child) => ({ id: child.id, label: child.name }))
            : [{ id: parent.id, label: parent.name }],
      };
    });
  }, [categoryOptionsForSelectedType, form.transactionType]);

  const transactionTypeLabel =
    form.transactionType === 'INCOME' ? 'Income' : form.transactionType === 'EXPENSE' ? 'Expense' : 'Transfer';

  const transactionTypeHelpText =
    form.transactionType === 'INCOME'
      ? 'Money received into your account.'
      : form.transactionType === 'EXPENSE'
        ? 'Money paid out from your account.'
        : 'Move money between your own accounts.';

  const hasCustomFilters =
    Boolean(filterText.trim()) ||
    typeFilter !== 'ALL' ||
    accountFilter !== 'ALL' ||
    sortBy !== 'date' ||
    sortDirection !== 'desc' ||
    monthKey !== currentMonthKey;

  const badgeClass = (type: TransactionType) => {
    if (type === 'INCOME') {
      return `${styles.badge} ${styles.badgeIncome}`;
    }
    if (type === 'EXPENSE') {
      return `${styles.badge} ${styles.badgeExpense}`;
    }
    return `${styles.badge} ${styles.badgeTransfer}`;
  };

  const amountClass = (type: TransactionType) => {
    if (type === 'INCOME') {
      return styles.amountPositive;
    }
    if (type === 'EXPENSE') {
      return styles.amountNegative;
    }
    return styles.amountNeutral;
  };

  const formatAmount = (entry: LedgerTransaction) => {
    if (entry.transactionType === 'INCOME') {
      return `+${currency.format(entry.amount)}`;
    }
    if (entry.transactionType === 'EXPENSE') {
      return `-${currency.format(entry.amount)}`;
    }
    return currency.format(entry.amount);
  };

  return (
    <div className={styles.sectionGrid}>
      <article className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2 className={styles.panelTitle}>Transaction Highlights</h2>
          <p className={styles.panelText}>For {monthOptions.find((option) => option.key === monthKey)?.label ?? monthKey}</p>
        </div>
        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Income</p>
            <p className={`${styles.summaryValue} ${styles.amountPositive}`}>{currency.format(summaries.income)}</p>
          </div>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Expense</p>
            <p className={`${styles.summaryValue} ${styles.amountNegative}`}>{currency.format(summaries.expense)}</p>
          </div>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Net</p>
            <p className={`${styles.summaryValue} ${summaries.income - summaries.expense >= 0 ? styles.amountPositive : styles.amountNegative}`}>
              {currency.format(summaries.income - summaries.expense)}
            </p>
          </div>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Transfers</p>
            <p className={`${styles.summaryValue} ${styles.amountNeutral}`}>{currency.format(summaries.transfer)}</p>
          </div>
        </div>
      </article>

      <article className={styles.panel}>
        <div className={`${styles.iconToolbar} ${styles.stickyPanelToolbar}`}>
          <div>
            <h3 className={styles.panelTitle}>Transactions List</h3>
            <p className={styles.valueHint}>Primary daily action: add a new transaction quickly.</p>
          </div>
          <div className={styles.iconActions}>
            <button
              type="button"
              className={`${styles.button} ${styles.buttonPrimary} ${styles.buttonPrimaryEmphasis}`}
              onClick={openCreateModal}
            >
              + Add Transaction
            </button>
            <button
              type="button"
              className={`${styles.iconButton} ${showFilters ? styles.iconButtonActive : ''}`}
              onClick={() => setShowFilters((previous) => !previous)}
              aria-label="Toggle filters"
              title="Filters"
            >
              ⌕
            </button>
            <button
              type="button"
              className={styles.iconButton}
              onClick={clearFilters}
              aria-label="Reset filters"
              title="Reset"
            >
              ↺
            </button>
          </div>
        </div>

        {showFilters ? (
          <div className={styles.filterPanel}>
            <div className={styles.controlsRow}>
              <div className={styles.dateWidget}>
                <button className={styles.button} type="button" onClick={() => shiftMonth(-1)}>
                  {'<'}
                </button>
                <select
                  className={`${styles.select} ${styles.controlActive}`}
                  value={monthKey}
                  onChange={(event) => setMonthKey(event.target.value)}
                >
                  {monthOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <button className={styles.button} type="button" onClick={() => shiftMonth(1)}>
                  {'>'}
                </button>
              </div>
            </div>
            <div className={styles.controlsRow}>
              <input
                className={`${styles.input} ${filterText.trim() ? styles.controlActive : ''}`}
                placeholder="Search transaction"
                value={filterText}
                onChange={(event) => setFilterText(event.target.value)}
              />
              <select
                className={`${styles.select} ${typeFilter !== 'ALL' ? styles.controlActive : ''}`}
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value as TransactionTypeFilter)}
              >
                <option value="ALL">All types</option>
                <option value="INCOME">Income</option>
                <option value="EXPENSE">Expense</option>
                <option value="TRANSFER">Transfer</option>
              </select>
              <select
                className={`${styles.select} ${accountFilter !== 'ALL' ? styles.controlActive : ''}`}
                value={accountFilter}
                onChange={(event) => {
                  const value = event.target.value;
                  setAccountFilter(value === 'ALL' ? 'ALL' : Number(value));
                }}
              >
                <option value="ALL">All accounts</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
              <select
                className={`${styles.select} ${sortBy !== 'date' ? styles.controlActive : ''}`}
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as TransactionSort)}
              >
                <option value="date">Sort: Date</option>
                <option value="amount">Sort: Amount</option>
                <option value="type">Sort: Type</option>
              </select>
              <select
                className={`${styles.select} ${sortDirection !== 'desc' ? styles.controlActive : ''}`}
                value={sortDirection}
                onChange={(event) => setSortDirection(event.target.value as 'asc' | 'desc')}
              >
                <option value="asc">Asc</option>
                <option value="desc">Desc</option>
              </select>
            </div>
            <div className={styles.feedbackRow}>
              <div className={styles.feedbackChips}>
                <span className={`${styles.feedbackChip} ${styles.feedbackChipActive}`}>
                  Month: {monthOptions.find((option) => option.key === monthKey)?.label ?? monthKey}
                </span>
                <span className={`${styles.feedbackChip} ${typeFilter !== 'ALL' ? styles.feedbackChipActive : ''}`}>
                  Type: {typeFilter}
                </span>
                <span className={`${styles.feedbackChip} ${accountFilter !== 'ALL' ? styles.feedbackChipActive : ''}`}>
                  Account: {accountFilterName}
                </span>
                <span className={`${styles.feedbackChip} ${filterText.trim() ? styles.feedbackChipActive : ''}`}>
                  Search: {filterText.trim() || 'Any'}
                </span>
                <span className={`${styles.feedbackChip} ${sortBy !== 'date' || sortDirection !== 'desc' ? styles.feedbackChipActive : ''}`}>
                  Sort: {sortBy} ({sortDirection})
                </span>
              </div>
              <span className={styles.feedbackCount}>
                Showing {visibleTransactions.length} transaction{visibleTransactions.length === 1 ? '' : 's'}
              </span>
            </div>
            {hasCustomFilters ? <p className={styles.valueHint}>Custom filters are active.</p> : null}
          </div>
        ) : null}

        <div className={styles.tableWrapTall}>
          <table className={styles.table}>
            <thead className={styles.tableHeadSticky}>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>From</th>
                <th>To</th>
                <th>Category</th>
                <th className={styles.numberCell}>Amount</th>
                <th>Note</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleTransactions.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.transactionDate}</td>
                  <td>
                    <span className={badgeClass(entry.transactionType)}>{entry.transactionType}</span>
                  </td>
                  <td>{entry.accountName}</td>
                  <td>{entry.toAccountName ?? '-'}</td>
                  <td>{entry.transactionType === 'TRANSFER' ? '-' : entry.categoryName ?? 'Uncategorized'}</td>
                  <td className={`${styles.numberCell} ${amountClass(entry.transactionType)}`}>{formatAmount(entry)}</td>
                  <td>{entry.note ?? '-'}</td>
                  <td>
                    <div className={styles.formActions}>
                      <button className={styles.button} type="button" onClick={() => editTransaction(entry)}>
                        Edit
                      </button>
                      <button
                        className={`${styles.button} ${styles.buttonDanger}`}
                        type="button"
                        onClick={() => removeTransaction(entry.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!visibleTransactions.length ? <p className={styles.emptyText}>No transactions found.</p> : null}
      </article>

      {showTransactionModal ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Transaction form">
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <h3 className={styles.panelTitle}>{editingId === null ? 'Add Transaction' : 'Edit Transaction'}</h3>
              <button
                className={styles.button}
                type="button"
                onClick={() => {
                  setShowTransactionModal(false);
                  if (editingId !== null) {
                    resetForm();
                  }
                }}
              >
                Close
              </button>
            </div>
            <form className={styles.modalFormStack} onSubmit={submitTransaction}>
              <div className={styles.formField}>
                <label className={styles.fieldLabel}>1. Choose transaction type</label>
                <div className={styles.segmentedRow} role="radiogroup" aria-label="Transaction type">
                  {(['EXPENSE', 'INCOME', 'TRANSFER'] as TransactionType[]).map((type) => (
                    <button
                      key={type}
                      type="button"
                      className={`${styles.segmentButton} ${form.transactionType === type ? styles.segmentButtonActive : ''}`}
                      onClick={() =>
                        setForm((previous) => ({
                          ...previous,
                          transactionType: type,
                          categoryId:
                            type === 'TRANSFER'
                              ? undefined
                              : previous.categoryId && categoryById.get(previous.categoryId)?.categoryType === type
                                ? previous.categoryId
                                : undefined,
                          toAccountId: type === 'TRANSFER' ? previous.toAccountId : 0,
                        }))
                      }
                      aria-pressed={form.transactionType === type}
                    >
                      {type === 'INCOME' ? 'Income' : type === 'EXPENSE' ? 'Expense' : 'Transfer'}
                    </button>
                  ))}
                </div>
                <p className={styles.fieldHelp}>{transactionTypeHelpText}</p>
              </div>

              <div className={styles.modalFormGrid}>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel} htmlFor="transaction-source-account">
                    2. Select source account
                  </label>
                  <select
                    id="transaction-source-account"
                    className={styles.select}
                    value={form.accountId}
                    onChange={(event) => setForm((previous) => ({ ...previous, accountId: Number(event.target.value) }))}
                    required
                  >
                    <option value={0}>Choose source account</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </div>

                {form.transactionType === 'TRANSFER' ? (
                  <div className={styles.formField}>
                    <label className={styles.fieldLabel} htmlFor="transaction-destination-account">
                      3. Select destination account
                    </label>
                    <select
                      id="transaction-destination-account"
                      className={styles.select}
                      value={form.toAccountId}
                      onChange={(event) =>
                        setForm((previous) => ({ ...previous, toAccountId: Number(event.target.value) }))
                      }
                      required
                    >
                      <option value={0}>Choose destination account</option>
                      {accounts
                        .filter((account) => account.id !== form.accountId)
                        .map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name}
                          </option>
                        ))}
                    </select>
                  </div>
                ) : (
                  <div className={styles.formField}>
                    <label className={styles.fieldLabel} htmlFor="transaction-category">
                      3. Choose category
                    </label>
                    <select
                      name="categoryId"
                      id="transaction-category"
                      className={styles.select}
                      value={form.categoryId ?? 0}
                      onChange={(event) => {
                        if (event.target.value === '__add_new__') {
                          openCategoryCreateModal();
                          return;
                        }
                        const selectedCategoryId = Number(event.target.value);
                        setForm((previous) => ({
                          ...previous,
                          categoryId: selectedCategoryId === 0 ? undefined : selectedCategoryId,
                        }));
                      }}
                    >
                      <option value={0}>Uncategorized</option>
                      {recentCategoriesForSelectedType.length > 0 ? (
                        <optgroup label="Recent">
                          {recentCategoriesForSelectedType.map((category) => (
                            <option key={`recent-${category.id}`} value={category.id}>
                              {category.parentName ? `${category.parentName} › ${category.name}` : category.name}
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                      {groupedCategoryOptionsForSelectedType.map((group) => (
                        <optgroup key={group.groupLabel} label={group.groupLabel}>
                          {group.options.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                      <option value="__add_new__">+ Add new</option>
                    </select>
                  </div>
                )}
              </div>

              <div className={styles.modalFormGrid}>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel} htmlFor="transaction-amount">
                    4. Enter amount
                  </label>
                  <input
                    id="transaction-amount"
                    className={styles.input}
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={Number.isFinite(form.amount) ? form.amount : ''}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        amount: event.target.value === '' ? Number.NaN : Number(event.target.value),
                      }))
                    }
                    required
                  />
                </div>

                <div className={styles.formField}>
                  <label className={styles.fieldLabel} htmlFor="transaction-date">
                    5. Choose date
                  </label>
                  <input
                    id="transaction-date"
                    className={styles.input}
                    type="date"
                    value={form.transactionDate}
                    onChange={(event) => setForm((previous) => ({ ...previous, transactionDate: event.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className={styles.formField}>
                <label className={styles.fieldLabel} htmlFor="transaction-note">
                  6. Add a note (optional)
                </label>
                <input
                  id="transaction-note"
                  className={styles.input}
                  placeholder="Add short context (e.g., Grocery shopping, Salary, Transfer to savings)"
                  value={form.note}
                  onChange={(event) => setForm((previous) => ({ ...previous, note: event.target.value }))}
                />
              </div>

              <div className={styles.modalInsight}>
                <p className={styles.valueHint}>
                  You are creating a <strong>{transactionTypeLabel}</strong> entry for{' '}
                  <strong>{form.amount > 0 ? currency.format(form.amount) : currency.format(0)}</strong>.
                </p>
              </div>

              <div className={styles.modalActionsRow}>
                <button className={`${styles.button} ${styles.buttonPrimary}`} type="submit">
                  {editingId === null ? 'Create' : 'Update'}
                </button>
                <button
                  className={styles.button}
                  type="button"
                  onClick={() => {
                    setShowTransactionModal(false);
                    resetForm();
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {showCategoryCreateModal ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Create category">
          <div className={styles.modalCardSmall}>
            <div className={styles.modalHeader}>
              <h3 className={styles.panelTitle}>Add Category</h3>
              <button className={styles.button} type="button" onClick={() => setShowCategoryCreateModal(false)}>
                Close
              </button>
            </div>
            <form className={styles.modalFormStack} onSubmit={submitCategoryCreate}>
              <div className={styles.formField}>
                <label className={styles.fieldLabel} htmlFor="new-category-type">
                  Type
                </label>
                <select
                  id="new-category-type"
                  className={styles.select}
                  value={categoryCreateType}
                  onChange={(event) => setCategoryCreateType(event.target.value as CategoryType)}
                >
                  <option value="EXPENSE">Expense</option>
                  <option value="INCOME">Income</option>
                </select>
              </div>

              <div className={styles.formField}>
                <label className={styles.fieldLabel} htmlFor="new-category-name">
                  Category name
                </label>
                <input
                  id="new-category-name"
                  className={styles.input}
                  placeholder="e.g. Groceries"
                  value={newCategoryName}
                  onChange={(event) => setNewCategoryName(event.target.value)}
                  required
                />
              </div>

              <div className={styles.formField}>
                <label className={styles.fieldLabel} htmlFor="new-subcategory-name">
                  Subcategory name
                </label>
                <input
                  id="new-subcategory-name"
                  className={styles.input}
                  placeholder="Optional (e.g. Vegetables)"
                  value={newSubcategoryName}
                  onChange={(event) => setNewSubcategoryName(event.target.value)}
                />
              </div>

              <div className={styles.modalActionsRow}>
                <button className={`${styles.button} ${styles.buttonPrimary}`} type="submit">
                  Create
                </button>
                <button
                  className={styles.button}
                  type="button"
                  onClick={() => setShowCategoryCreateModal(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {toast ? <div className={styles.toast}>{toast}</div> : null}
    </div>
  );
};
