import { type FormEvent, useEffect, useMemo, useState } from 'react';
import type { AccountInput, AccountType, AccountWithBalance, LedgerTransaction } from '../../shared/types/ledger';
import styles from './LedgerPage.module.css';

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

const defaultForm: AccountInput = {
  name: '',
  accountType: 'BANK',
  openingBalance: 0,
  notes: '',
};

type AccountSort = 'name' | 'type' | 'balance';
type AccountTypeFilter = 'ALL' | AccountType;

interface PassbookEntry {
  id: number;
  date: string;
  particulars: string;
  withdrawal: number;
  deposit: number;
  balance: number;
}

const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

export const AccountsPage = () => {
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [transactions, setTransactions] = useState<LedgerTransaction[]>([]);
  const [form, setForm] = useState<AccountInput>(defaultForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [filterText, setFilterText] = useState('');
  const [typeFilter, setTypeFilter] = useState<AccountTypeFilter>('ALL');
  const [sortBy, setSortBy] = useState<AccountSort>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [toast, setToast] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [selectedPassbookAccountId, setSelectedPassbookAccountId] = useState<number | null>(null);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(''), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const loadAccounts = async () => {
    try {
      const [accountData, transactionData] = await Promise.all([
        window.api.listAccounts(),
        window.api.listTransactions(),
      ]);
      setAccounts(accountData);
      setTransactions(transactionData);
    } catch (loadError) {
      setToast(loadError instanceof Error ? loadError.message : 'Failed to load accounts.');
    }
  };

  useEffect(() => {
    void loadAccounts();
  }, []);

  const visibleAccounts = useMemo(() => {
    const keyword = filterText.trim().toLowerCase();
    const filtered = accounts.filter((account) => {
      if (typeFilter !== 'ALL' && account.accountType !== typeFilter) {
        return false;
      }
      if (!keyword) {
        return true;
      }
      return (
        account.name.toLowerCase().includes(keyword) ||
        account.accountType.toLowerCase().includes(keyword) ||
        (account.notes ?? '').toLowerCase().includes(keyword)
      );
    });

    filtered.sort((left, right) => {
      let compare = 0;
      if (sortBy === 'name') {
        compare = left.name.localeCompare(right.name);
      } else if (sortBy === 'type') {
        compare = left.accountType.localeCompare(right.accountType);
      } else {
        compare = left.currentBalance - right.currentBalance;
      }
      return sortDirection === 'asc' ? compare : -compare;
    });

    return filtered;
  }, [accounts, filterText, sortBy, sortDirection, typeFilter]);

  const summaries = useMemo(() => {
    return accounts.reduce(
      (accumulator, account) => {
        accumulator.opening += account.openingBalance;
        accumulator.current += account.currentBalance;
        if (account.accountType === 'BANK') {
          accumulator.bank += 1;
        } else if (account.accountType === 'CASH') {
          accumulator.cash += 1;
        } else {
          accumulator.wallet += 1;
        }
        return accumulator;
      },
      { opening: 0, current: 0, bank: 0, cash: 0, wallet: 0 },
    );
  }, [accounts]);

  const resetForm = () => {
    setForm(defaultForm);
    setEditingId(null);
  };

  const openCreateModal = () => {
    resetForm();
    setShowAccountModal(true);
  };

  const submitAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      if (!form.name.trim()) {
        throw new Error('Account name is required.');
      }
      if (!Number.isFinite(form.openingBalance)) {
        throw new Error('Opening balance must be a valid number.');
      }

      const payload: AccountInput = {
        ...form,
        name: form.name.trim(),
        notes: form.notes?.trim() ?? '',
      };

      if (editingId === null) {
        await window.api.createAccount(payload);
      } else {
        await window.api.updateAccount(editingId, payload);
      }

      resetForm();
      setShowAccountModal(false);
      await loadAccounts();
    } catch (submitError) {
      setToast(submitError instanceof Error ? submitError.message : 'Failed to save account.');
    }
  };

  const editAccount = (account: AccountWithBalance) => {
    setEditingId(account.id);
    setForm({
      name: account.name,
      accountType: account.accountType,
      openingBalance: account.openingBalance,
      notes: account.notes ?? '',
    });
    setShowAccountModal(true);
  };

  const removeAccount = async (id: number) => {
    try {
      await window.api.deleteAccount(id);
      await loadAccounts();
      if (editingId === id) {
        resetForm();
      }
    } catch (deleteError) {
      setToast(deleteError instanceof Error ? deleteError.message : 'Failed to delete account.');
    }
  };

  const clearFilters = () => {
    setFilterText('');
    setTypeFilter('ALL');
    setSortBy('name');
    setSortDirection('asc');
  };

  const hasCustomFilters =
    Boolean(filterText.trim()) || typeFilter !== 'ALL' || sortBy !== 'name' || sortDirection !== 'asc';

  const formatTypeCount = (type: AccountType) => {
    if (type === 'BANK') {
      return summaries.bank;
    }
    if (type === 'CASH') {
      return summaries.cash;
    }
    return summaries.wallet;
  };

  const selectedPassbookAccount = useMemo(
    () => accounts.find((account) => account.id === selectedPassbookAccountId) ?? null,
    [accounts, selectedPassbookAccountId],
  );

  const passbookEntries = useMemo<PassbookEntry[]>(() => {
    if (!selectedPassbookAccount) {
      return [];
    }

    const accountId = selectedPassbookAccount.id;
    const accountTransactions = transactions
      .filter((entry) => entry.accountId === accountId || entry.toAccountId === accountId)
      .sort((left, right) => {
        const dateCompare = left.transactionDate.localeCompare(right.transactionDate);
        if (dateCompare !== 0) {
          return dateCompare;
        }
        return left.id - right.id;
      });

    let runningBalance = selectedPassbookAccount.openingBalance;

    return accountTransactions.map((entry) => {
      let withdrawal = 0;
      let deposit = 0;
      let particulars = entry.note?.trim() || entry.categoryName || entry.transactionType;

      if (entry.transactionType === 'TRANSFER') {
        if (entry.accountId === accountId) {
          withdrawal = entry.amount;
          particulars = `Transfer to ${entry.toAccountName ?? 'another account'}`;
        } else {
          deposit = entry.amount;
          particulars = `Transfer from ${entry.accountName}`;
        }
      } else if (entry.transactionType === 'INCOME') {
        deposit = entry.amount;
      } else {
        withdrawal = entry.amount;
      }

      runningBalance += deposit - withdrawal;

      return {
        id: entry.id,
        date: entry.transactionDate,
        particulars,
        withdrawal,
        deposit,
        balance: runningBalance,
      };
    });
  }, [selectedPassbookAccount, transactions]);

  return (
    <div className={styles.sectionGrid}>
      <article className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2 className={styles.panelTitle}>Account Highlights</h2>
          <p className={styles.panelText}>Track balances across bank, cash, and wallet.</p>
        </div>
        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Total Accounts</p>
            <p className={styles.summaryValue}>{accounts.length}</p>
          </div>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Opening Balance</p>
            <p className={styles.summaryValue}>{currency.format(summaries.opening)}</p>
          </div>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Current Balance</p>
            <p className={`${styles.summaryValue} ${summaries.current >= 0 ? styles.amountPositive : styles.amountNegative}`}>
              {currency.format(summaries.current)}
            </p>
          </div>
        </div>
      </article>

      <article className={styles.panel}>
        <div
          key={selectedPassbookAccount ? `passbook-${selectedPassbookAccount.id}` : 'accounts-list'}
          className={styles.viewTransitionPane}
        >
          {selectedPassbookAccount ? (
            <>
            <div className={`${styles.iconToolbar} ${styles.stickyPanelToolbar}`}>
              <button
                type="button"
                className={`${styles.button} ${styles.buttonPrimary}`}
                onClick={() => setSelectedPassbookAccountId(null)}
              >
                ← Back to Accounts
              </button>
              <div>
                <h3 className={styles.panelTitle}>Digital Passbook</h3>
                <p className={styles.valueHint}>Statement view for {selectedPassbookAccount.name}.</p>
              </div>
            </div>

            <div className={styles.summaryGrid}>
              <div className={styles.summaryCard}>
                <p className={styles.summaryLabel}>Account</p>
                <p className={styles.summaryValue}>{selectedPassbookAccount.name}</p>
              </div>
              <div className={styles.summaryCard}>
                <p className={styles.summaryLabel}>Type</p>
                <p className={styles.summaryValue}>{selectedPassbookAccount.accountType}</p>
              </div>
              <div className={styles.summaryCard}>
                <p className={styles.summaryLabel}>Opening Balance</p>
                <p className={styles.summaryValue}>{currency.format(selectedPassbookAccount.openingBalance)}</p>
              </div>
              <div className={styles.summaryCard}>
                <p className={styles.summaryLabel}>Current Balance</p>
                <p
                  className={`${styles.summaryValue} ${
                    selectedPassbookAccount.currentBalance >= 0 ? styles.amountPositive : styles.amountNegative
                  }`}
                >
                  {currency.format(selectedPassbookAccount.currentBalance)}
                </p>
              </div>
            </div>

            {selectedPassbookAccount.notes ? (
              <p className={styles.valueHint}>Note: {selectedPassbookAccount.notes}</p>
            ) : null}

            <div className={styles.tableWrapTall}>
              <table className={styles.table}>
                <thead className={styles.tableHeadSticky}>
                  <tr>
                    <th>Date</th>
                    <th>Particulars</th>
                    <th className={styles.numberCell}>Withdrawals</th>
                    <th className={styles.numberCell}>Deposits</th>
                    <th className={styles.numberCell}>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {passbookEntries.map((entry) => (
                    <tr key={`${entry.id}-${entry.date}`}>
                      <td>{dateFormatter.format(new Date(entry.date))}</td>
                      <td>{entry.particulars}</td>
                      <td className={`${styles.numberCell} ${entry.withdrawal > 0 ? styles.amountNegative : styles.amountNeutral}`}>
                        {entry.withdrawal > 0 ? currency.format(entry.withdrawal) : '-'}
                      </td>
                      <td className={`${styles.numberCell} ${entry.deposit > 0 ? styles.amountPositive : styles.amountNeutral}`}>
                        {entry.deposit > 0 ? currency.format(entry.deposit) : '-'}
                      </td>
                      <td className={`${styles.numberCell} ${entry.balance >= 0 ? styles.amountPositive : styles.amountNegative}`}>
                        {currency.format(entry.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!passbookEntries.length ? <p className={styles.emptyText}>No transactions for this account yet.</p> : null}
            </>
          ) : (
            <>
            <div className={`${styles.iconToolbar} ${styles.stickyPanelToolbar}`}>
              <div>
                <h3 className={styles.panelTitle}>Accounts List</h3>
                <p className={styles.valueHint}>Primary daily action: add account quickly for clean tracking.</p>
              </div>
              <div className={styles.iconActions}>
                <button
                  type="button"
                  className={`${styles.button} ${styles.buttonPrimary} ${styles.buttonPrimaryEmphasis}`}
                  onClick={openCreateModal}
                >
                  + Add Account
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
                  <input
                    className={`${styles.input} ${filterText.trim() ? styles.controlActive : ''}`}
                    placeholder="Search account"
                    value={filterText}
                    onChange={(event) => setFilterText(event.target.value)}
                  />
                  <select
                    className={`${styles.select} ${typeFilter !== 'ALL' ? styles.controlActive : ''}`}
                    value={typeFilter}
                    onChange={(event) => setTypeFilter(event.target.value as AccountTypeFilter)}
                  >
                    <option value="ALL">All types</option>
                    <option value="BANK">Bank</option>
                    <option value="CASH">Cash</option>
                    <option value="WALLET">Wallet</option>
                  </select>
                  <select
                    className={`${styles.select} ${sortBy !== 'name' ? styles.controlActive : ''}`}
                    value={sortBy}
                    onChange={(event) => setSortBy(event.target.value as AccountSort)}
                  >
                    <option value="name">Sort: Name</option>
                    <option value="type">Sort: Type</option>
                    <option value="balance">Sort: Balance</option>
                  </select>
                  <select
                    className={`${styles.select} ${sortDirection !== 'asc' ? styles.controlActive : ''}`}
                    value={sortDirection}
                    onChange={(event) => setSortDirection(event.target.value as 'asc' | 'desc')}
                  >
                    <option value="asc">Asc</option>
                    <option value="desc">Desc</option>
                  </select>
                </div>
                <div className={styles.feedbackRow}>
                  <div className={styles.feedbackChips}>
                    <span className={`${styles.feedbackChip} ${typeFilter !== 'ALL' ? styles.feedbackChipActive : ''}`}>
                      Type: {typeFilter}
                    </span>
                    <span className={`${styles.feedbackChip} ${filterText.trim() ? styles.feedbackChipActive : ''}`}>
                      Search: {filterText.trim() || 'Any'}
                    </span>
                    <span className={`${styles.feedbackChip} ${sortBy !== 'name' || sortDirection !== 'asc' ? styles.feedbackChipActive : ''}`}>
                      Sort: {sortBy} ({sortDirection})
                    </span>
                    <span className={styles.feedbackChip}>Count ({typeFilter}): {typeFilter === 'ALL' ? visibleAccounts.length : formatTypeCount(typeFilter)}</span>
                  </div>
                  <span className={styles.feedbackCount}>
                    Showing {visibleAccounts.length} account{visibleAccounts.length === 1 ? '' : 's'}
                  </span>
                </div>
                {hasCustomFilters ? <p className={styles.valueHint}>Custom filters are active.</p> : null}
              </div>
            ) : null}

            <div className={styles.tableWrapTall}>
              <table className={styles.table}>
                <thead className={styles.tableHeadSticky}>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th className={styles.numberCell}>Opening</th>
                    <th className={styles.numberCell}>Current</th>
                    <th>Notes</th>
                    <th>Passbook</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleAccounts.map((account) => (
                    <tr key={account.id}>
                      <td>{account.name}</td>
                      <td>{account.accountType}</td>
                      <td className={styles.numberCell}>{currency.format(account.openingBalance)}</td>
                      <td className={`${styles.numberCell} ${account.currentBalance >= 0 ? styles.amountPositive : styles.amountNegative}`}>
                        {currency.format(account.currentBalance)}
                      </td>
                      <td>{account.notes ?? '-'}</td>
                      <td>
                        <button
                          className={`${styles.button} ${styles.buttonNeutralAction}`}
                          type="button"
                          onClick={() => setSelectedPassbookAccountId(account.id)}
                        >
                          View Passbook
                        </button>
                      </td>
                      <td>
                        <div className={styles.formActions}>
                          <button className={styles.button} type="button" onClick={() => editAccount(account)}>
                            Edit
                          </button>
                          <button
                            className={`${styles.button} ${styles.buttonDanger}`}
                            type="button"
                            onClick={() => removeAccount(account.id)}
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
            {!visibleAccounts.length ? <p className={styles.emptyText}>No accounts found.</p> : null}
            </>
          )}
        </div>
      </article>

      {showAccountModal ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Account form">
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <h3 className={styles.panelTitle}>{editingId === null ? 'Add Account' : 'Edit Account'}</h3>
              <button
                className={styles.button}
                type="button"
                onClick={() => {
                  setShowAccountModal(false);
                  if (editingId !== null) {
                    resetForm();
                  }
                }}
              >
                Close
              </button>
            </div>
            <form className={styles.formGrid} onSubmit={submitAccount}>
              <input
                className={styles.input}
                placeholder="Account name"
                value={form.name}
                onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}
              />

              <select
                className={styles.select}
                value={form.accountType}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, accountType: event.target.value as AccountType }))
                }
              >
                <option value="BANK">Bank</option>
                <option value="CASH">Cash</option>
                <option value="WALLET">Wallet</option>
              </select>

              <input
                className={styles.input}
                type="number"
                step="0.01"
                placeholder="Opening balance"
                value={Number.isFinite(form.openingBalance) ? form.openingBalance : ''}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    openingBalance: event.target.value === '' ? Number.NaN : Number(event.target.value),
                  }))
                }
              />

              <input
                className={styles.input}
                placeholder="Notes"
                value={form.notes}
                onChange={(event) => setForm((previous) => ({ ...previous, notes: event.target.value }))}
              />

              <div className={styles.formActions}>
                <button className={`${styles.button} ${styles.buttonPrimary}`} type="submit">
                  {editingId === null ? 'Create Account' : 'Update Account'}
                </button>
                <button
                  className={styles.button}
                  type="button"
                  onClick={() => {
                    setShowAccountModal(false);
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

      {toast ? <div className={styles.toast}>{toast}</div> : null}
    </div>
  );
};
