import { useEffect, useMemo, useState } from 'react';
import type {
  AccountWithBalance,
  LabourEntry,
  LabourEntryInput,
  LabourEntryType,
  LabourerInput,
  LabourerSummary,
} from '../../shared/types/ledger';
import styles from './LedgerPage.module.css';

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

const signedCurrency = (amount: number): string => {
  const absolute = currency.format(Math.abs(amount));
  if (amount > 0) {
    return `+ ${absolute}`;
  }
  if (amount < 0) {
    return `- ${absolute}`;
  }
  return absolute;
};

const amountClassName = (amount: number): string => {
  if (amount > 0) {
    return styles.amountPositive;
  }
  if (amount < 0) {
    return styles.amountNegative;
  }
  return styles.amountNeutral;
};

const today = new Date().toISOString().slice(0, 10);

interface BulkWorkerRow {
  id: number;
  name: string;
  notes: string;
}

const newWorkerRow = (id: number): BulkWorkerRow => ({ id, name: '', notes: '' });

const defaultEntryForm: LabourEntryInput = {
  labourerId: 0,
  entryType: 'WAGE',
  amount: 0,
  entryDate: today,
  note: '',
  paymentAccountId: 0,
};

type EntrySort = 'date' | 'amount' | 'type';

export const LabourPage = () => {
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [labourers, setLabourers] = useState<LabourerSummary[]>([]);
  const [entries, setEntries] = useState<LabourEntry[]>([]);

  const [selectedLabourerId, setSelectedLabourerId] = useState<number>(0);
  const [entryFilter, setEntryFilter] = useState('');
  const [entrySort, setEntrySort] = useState<EntrySort>('date');
  const [showEntryFilters, setShowEntryFilters] = useState(false);

  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [workerModalOpen, setWorkerModalOpen] = useState(false);
  const [entryForm, setEntryForm] = useState<LabourEntryInput>(defaultEntryForm);
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);

  const [workerRows, setWorkerRows] = useState<BulkWorkerRow[]>([newWorkerRow(1)]);
  const [toast, setToast] = useState('');

  const selectedWorkerName = useMemo(() => {
    if (!selectedLabourerId) {
      return 'All workers';
    }
    return labourers.find((labourer) => labourer.id === selectedLabourerId)?.name ?? 'Selected worker';
  }, [labourers, selectedLabourerId]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const bankAccounts = useMemo(
    () => accounts.filter((account) => account.accountType === 'BANK'),
    [accounts],
  );

  const loadLabourers = async () => {
    const labourerData = await window.api.listLabourers();
    setLabourers(labourerData);
    if (!entryForm.labourerId && labourerData.length > 0) {
      setEntryForm((previous) => ({ ...previous, labourerId: labourerData[0].id }));
    }
  };

  const loadEntriesAndSummaries = async (labourerId?: number) => {
    const [entryData] = await Promise.all([
      window.api.listLabourEntries(labourerId),
    ]);
    setEntries(entryData);
  };

  const loadData = async (labourerId?: number) => {
    try {
      const [accountData] = await Promise.all([window.api.listAccounts(), loadLabourers()]);
      setAccounts(accountData);
      await loadEntriesAndSummaries(labourerId);
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Failed to load labour data.');
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    void loadEntriesAndSummaries(selectedLabourerId || undefined).catch((error: unknown) => {
      setToast(error instanceof Error ? error.message : 'Failed to load filtered labour data.');
    });
  }, [selectedLabourerId]);

  const visibleEntries = useMemo(() => {
    const keyword = entryFilter.trim().toLowerCase();
    const filtered = keyword
      ? entries.filter(
          (entry) =>
            entry.labourerName.toLowerCase().includes(keyword) ||
            entry.entryType.toLowerCase().includes(keyword) ||
            (entry.paymentAccountName ?? '').toLowerCase().includes(keyword) ||
            (entry.note ?? '').toLowerCase().includes(keyword),
        )
      : [...entries];

    filtered.sort((left, right) => {
      if (entrySort === 'date') {
        return right.entryDate.localeCompare(left.entryDate);
      }
      if (entrySort === 'amount') {
        return right.amount - left.amount;
      }
      return left.entryType.localeCompare(right.entryType);
    });

    return filtered;
  }, [entries, entryFilter, entrySort]);

  const hasEntrySearch = entryFilter.trim().length > 0;
  const hasWorkerFilter = selectedLabourerId !== 0;

  const compactLabourers = useMemo(() => {
    return [...labourers]
      .sort((left, right) => right.pending - left.pending)
      .slice(0, 10);
  }, [labourers]);

  const totals = useMemo(() => {
    return labourers.reduce(
      (aggregate, labourer) => ({
        totalEarned: aggregate.totalEarned + labourer.totalEarned,
        totalPaid: aggregate.totalPaid + labourer.totalPaid,
        pending: aggregate.pending + labourer.pending,
      }),
      { totalEarned: 0, totalPaid: 0, pending: 0 },
    );
  }, [labourers]);

  const resetEntryForm = () => {
    setEntryForm((previous) => ({
      ...defaultEntryForm,
      labourerId: selectedLabourerId || labourers[0]?.id || previous.labourerId,
      entryDate: today,
    }));
    setEditingEntryId(null);
  };

  const openCreateEntryModal = () => {
    resetEntryForm();
    setEntryModalOpen(true);
  };

  const openEditEntryModal = (entry: LabourEntry) => {
    setEditingEntryId(entry.id);
    setEntryForm({
      labourerId: entry.labourerId,
      entryType: entry.entryType,
      amount: entry.amount,
      entryDate: entry.entryDate,
      note: entry.note ?? '',
      paymentAccountId: entry.paymentAccountId ?? 0,
    });
    setEntryModalOpen(true);
  };

  const closeEntryModal = () => {
    setEntryModalOpen(false);
    resetEntryForm();
  };

  const addWorkerRow = () => {
    setWorkerRows((previous) => [...previous, newWorkerRow(Date.now())]);
  };

  const removeWorkerRow = (id: number) => {
    setWorkerRows((previous) => {
      if (previous.length === 1) {
        return previous;
      }
      return previous.filter((row) => row.id !== id);
    });
  };

  const updateWorkerRow = (id: number, patch: Partial<BulkWorkerRow>) => {
    setWorkerRows((previous) => previous.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const resetWorkerModal = () => {
    setWorkerRows([newWorkerRow(1)]);
  };

  const closeWorkerModal = () => {
    setWorkerModalOpen(false);
    resetWorkerModal();
  };

  const submitBulkWorkers = async () => {
    try {
      const payloads = workerRows
        .map((row) => ({ name: row.name.trim(), notes: row.notes.trim() }))
        .filter((row) => row.name.length > 0);

      if (!payloads.length) {
        throw new Error('Add at least one worker name.');
      }

      await Promise.all(payloads.map((payload) => window.api.createLabourer(payload as LabourerInput)));
      await loadData(selectedLabourerId || undefined);
      closeWorkerModal();
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Failed to create workers.');
    }
  };

  const submitEntry = async () => {
    try {
      if (!entryForm.labourerId) {
        throw new Error('Select a labourer before saving entry.');
      }
      if (!Number.isFinite(entryForm.amount) || entryForm.amount <= 0) {
        throw new Error('Amount must be greater than zero.');
      }

      const shouldUseBank = entryForm.entryType !== 'WAGE';
      const payload: LabourEntryInput = {
        ...entryForm,
        amount: Number(entryForm.amount),
        note: entryForm.note?.trim() ?? '',
        paymentAccountId: shouldUseBank ? entryForm.paymentAccountId : 0,
      };

      if (editingEntryId === null) {
        await window.api.createLabourEntry(payload);
      } else {
        await window.api.updateLabourEntry(editingEntryId, payload);
      }

      await loadData(selectedLabourerId || undefined);
      closeEntryModal();
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Failed to save labour entry.');
    }
  };

  const removeEntry = async (id: number) => {
    try {
      await window.api.deleteLabourEntry(id);
      await loadData(selectedLabourerId || undefined);
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Failed to delete labour entry.');
    }
  };

  const entryBadgeClass = (type: LabourEntryType) => {
    if (type === 'WAGE') {
      return `${styles.badge} ${styles.badgeIncome}`;
    }
    return `${styles.badge} ${styles.badgeExpense}`;
  };

  return (
    <div className={styles.sectionGrid}>
      <article className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2 className={styles.panelTitle}>Labour Operations</h2>
          <div className={styles.compactActions}>
            <button className={`${styles.button} ${styles.buttonPrimary}`} type="button" onClick={() => setWorkerModalOpen(true)}>
              + Create Workers
            </button>
          </div>
        </div>
        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Total Earned</p>
            <p className={styles.summaryValue}>{currency.format(totals.totalEarned)}</p>
          </div>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Total Paid</p>
            <p className={styles.summaryValue}>{currency.format(totals.totalPaid)}</p>
          </div>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Net Position</p>
            <p className={`${styles.summaryValue} ${amountClassName(totals.pending)}`}>
              {signedCurrency(totals.pending)}
            </p>
            <p className={styles.valueHint}>
              {totals.pending > 0
                ? 'You owe workers.'
                : totals.pending < 0
                  ? 'Workers owe you.'
                  : 'Settled balance.'}
            </p>
          </div>
        </div>
      </article>

      <section className={styles.splitGrid}>
        <article className={styles.panelSecondary}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Workers</h2>
            <p className={styles.panelText}>Compact summary</p>
          </div>
          <table className={styles.miniTable}>
            <thead>
              <tr>
                <th>Name</th>
                <th className={styles.numberCell}>Earned</th>
                <th className={styles.numberCell}>Paid</th>
                <th className={styles.numberCell}>Net Position</th>
              </tr>
            </thead>
            <tbody>
              {compactLabourers.map((labourer) => (
                <tr key={labourer.id}>
                  <td>{labourer.name}</td>
                  <td className={styles.numberCell}>{currency.format(labourer.totalEarned)}</td>
                  <td className={styles.numberCell}>{currency.format(labourer.totalPaid)}</td>
                  <td className={`${styles.numberCell} ${amountClassName(labourer.pending)}`}>
                    {signedCurrency(labourer.pending)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>

        <article className={styles.panel}>
          <div className={`${styles.iconToolbar} ${styles.stickyPanelToolbar}`}>
            <div>
              <p className={styles.panelText}>Labour payment entries</p>
              <p className={styles.valueHint}>Record Entries</p>
            </div>
            <div className={styles.iconActions}>
              <button
                type="button"
                className={`${styles.button} ${styles.buttonPrimary} ${styles.buttonPrimaryEmphasis}`}
                onClick={openCreateEntryModal}
                title="Add labour entry"
              >
                + Add Labour Entry
              </button>
              <button
                type="button"
                className={`${styles.iconButton} ${showEntryFilters ? styles.iconButtonActive : ''}`}
                onClick={() => setShowEntryFilters((previous) => !previous)}
                aria-label="Toggle entry filters"
                title="Filters"
              >
                ⌕
              </button>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => {
                  setEntryFilter('');
                  setEntrySort('date');
                  setSelectedLabourerId(0);
                }}
                aria-label="Reset entry filters"
                title="Reset"
              >
                ↺
              </button>
            </div>
          </div>

          <div className={styles.feedbackRow}>
            <span className={styles.feedbackCount}>{visibleEntries.length} records shown</span>
            <div className={styles.feedbackChips}>
              <span
                className={`${styles.feedbackChip} ${hasWorkerFilter ? styles.feedbackChipActive : ''}`}
              >
                Worker: {selectedWorkerName}
              </span>
              <span
                className={`${styles.feedbackChip} ${hasEntrySearch ? styles.feedbackChipActive : ''}`}
              >
                Search: {hasEntrySearch ? entryFilter.trim() : 'None'}
              </span>
              <span className={styles.feedbackChip}>Sort: {entrySort}</span>
            </div>
          </div>

          {showEntryFilters ? (
            <div className={styles.filterPanel}>
              <div className={styles.controlsRow}>
                <input
                  className={`${styles.input} ${hasEntrySearch ? styles.controlActive : ''}`}
                  placeholder="Search entry"
                  value={entryFilter}
                  onChange={(event) => setEntryFilter(event.target.value)}
                />
                <select
                  className={`${styles.select} ${hasWorkerFilter ? styles.controlActive : ''}`}
                  value={selectedLabourerId}
                  onChange={(event) => setSelectedLabourerId(Number(event.target.value))}
                >
                  <option value={0}>All workers</option>
                  {labourers.map((labourer) => (
                    <option key={labourer.id} value={labourer.id}>
                      {labourer.name}
                    </option>
                  ))}
                </select>
                <select
                  className={styles.select}
                  value={entrySort}
                  onChange={(event) => setEntrySort(event.target.value as EntrySort)}
                >
                  <option value="date">Sort: Date</option>
                  <option value="amount">Sort: Amount</option>
                  <option value="type">Sort: Type</option>
                </select>
              </div>
            </div>
          ) : null}

          <div className={styles.tableWrapTall}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Bank</th>
                  <th className={styles.numberCell}>Amount</th>
                  <th>Note</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.entryDate}</td>
                    <td>{entry.labourerName}</td>
                    <td>
                      <span className={entryBadgeClass(entry.entryType)}>{entry.entryType}</span>
                    </td>
                    <td>{entry.paymentAccountName ?? '-'}</td>
                    <td className={styles.numberCell}>{currency.format(entry.amount)}</td>
                    <td>{entry.note ?? '-'}</td>
                    <td>
                      <div className={styles.formActions}>
                        <button className={styles.button} type="button" onClick={() => openEditEntryModal(entry)}>
                          Edit
                        </button>
                        <button
                          className={`${styles.button} ${styles.buttonDanger}`}
                          type="button"
                          onClick={() => removeEntry(entry.id)}
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
        </article>
      </section>

      {workerModalOpen ? (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <h2 className={styles.panelTitle}>Create Workers (Bulk)</h2>
              <button className={styles.button} type="button" onClick={closeWorkerModal}>
                Close
              </button>
            </div>

            {workerRows.map((row) => (
              <div key={row.id} className={styles.bulkRow}>
                <input
                  className={styles.input}
                  placeholder="Worker name"
                  value={row.name}
                  onChange={(event) => updateWorkerRow(row.id, { name: event.target.value })}
                />
                <input
                  className={styles.input}
                  placeholder="Notes"
                  value={row.notes}
                  onChange={(event) => updateWorkerRow(row.id, { notes: event.target.value })}
                />
                <button className={`${styles.button} ${styles.buttonDanger}`} type="button" onClick={() => removeWorkerRow(row.id)}>
                  Remove
                </button>
              </div>
            ))}

            <div className={styles.compactActions}>
              <button className={styles.button} type="button" onClick={addWorkerRow}>
                + Add Row
              </button>
              <button className={`${styles.button} ${styles.buttonPrimary}`} type="button" onClick={submitBulkWorkers}>
                Save Workers
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {entryModalOpen ? (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <h2 className={styles.panelTitle}>{editingEntryId === null ? 'Add Labour Entry' : 'Edit Labour Entry'}</h2>
              <button className={styles.button} type="button" onClick={closeEntryModal}>
                Close
              </button>
            </div>

            <div className={styles.formGrid}>
              <select
                className={styles.select}
                value={entryForm.labourerId}
                onChange={(event) =>
                  setEntryForm((previous) => ({ ...previous, labourerId: Number(event.target.value) }))
                }
              >
                <option value={0}>Select worker</option>
                {labourers.map((labourer) => (
                  <option key={labourer.id} value={labourer.id}>
                    {labourer.name}
                  </option>
                ))}
              </select>

              <select
                className={styles.select}
                value={entryForm.entryType}
                onChange={(event) =>
                  setEntryForm((previous) => ({
                    ...previous,
                    entryType: event.target.value as LabourEntryType,
                    paymentAccountId: event.target.value === 'WAGE' ? 0 : previous.paymentAccountId,
                  }))
                }
              >
                <option value="WAGE">Wage</option>
                <option value="ADVANCE">Advance</option>
                <option value="PAYMENT">Payment</option>
              </select>

              <select
                className={styles.select}
                value={entryForm.paymentAccountId}
                disabled={entryForm.entryType === 'WAGE'}
                onChange={(event) =>
                  setEntryForm((previous) => ({ ...previous, paymentAccountId: Number(event.target.value) }))
                }
              >
                <option value={0}>Bank (optional)</option>
                {bankAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>

              <input
                className={styles.input}
                type="number"
                step="0.01"
                placeholder="Amount"
                value={Number.isFinite(entryForm.amount) ? entryForm.amount : ''}
                onChange={(event) =>
                  setEntryForm((previous) => ({
                    ...previous,
                    amount: event.target.value === '' ? Number.NaN : Number(event.target.value),
                  }))
                }
              />

              <input
                className={styles.input}
                type="date"
                value={entryForm.entryDate}
                onChange={(event) => setEntryForm((previous) => ({ ...previous, entryDate: event.target.value }))}
              />

              <input
                className={styles.input}
                placeholder="Note"
                value={entryForm.note}
                onChange={(event) => setEntryForm((previous) => ({ ...previous, note: event.target.value }))}
              />
            </div>

            <div className={styles.compactActions}>
              <button className={`${styles.button} ${styles.buttonPrimary}`} type="button" onClick={submitEntry}>
                {editingEntryId === null ? 'Create Entry' : 'Update Entry'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <div className={styles.toast}>{toast}</div> : null}
    </div>
  );
};
