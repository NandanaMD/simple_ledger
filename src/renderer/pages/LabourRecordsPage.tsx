import { useEffect, useMemo, useState } from 'react';
import type { LabourEntry, LabourEntryType, LabourSummaryResponse, LabourerSummary } from '../../shared/types/ledger';
import styles from './LedgerPage.module.css';

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

type EntrySort = 'date' | 'amount' | 'type' | 'name';
type SummaryMode = 'WEEKLY' | 'MONTHLY';
type EntryTypeFilter = 'ALL' | LabourEntryType;

const toMonthKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  return `${year}-${month}`;
};

const formatMonthLabel = (monthKey: string): string => {
  const [yearRaw, monthRaw] = monthKey.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  return new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric' }).format(
    new Date(year, month - 1, 1),
  );
};

const buildMonthOptions = (): string[] => {
  const now = new Date();
  const keys: string[] = [];
  for (let offset = -24; offset <= 12; offset += 1) {
    keys.push(toMonthKey(new Date(now.getFullYear(), now.getMonth() + offset, 1)));
  }
  return keys;
};

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

const entryTypePillClass = (entryType: LabourEntryType): string => {
  if (entryType === 'PAYMENT') {
    return `${styles.reportTypePill} ${styles.reportTypePillPayment}`;
  }
  if (entryType === 'ADVANCE') {
    return `${styles.reportTypePill} ${styles.reportTypePillAdvance}`;
  }
  return `${styles.reportTypePill} ${styles.reportTypePillWage}`;
};

const entryAmountClass = (entryType: LabourEntryType): string => {
  if (entryType === 'PAYMENT' || entryType === 'ADVANCE') {
    return styles.reportAmountExpense;
  }
  return styles.reportAmountIncome;
};

const signedEntryAmount = (entry: LabourEntry): string => {
  if (entry.entryType === 'PAYMENT' || entry.entryType === 'ADVANCE') {
    return `- ${currency.format(entry.amount)}`;
  }
  return `+ ${currency.format(entry.amount)}`;
};

const getIsoWeekStartDate = (year: number, week: number): Date => {
  const januaryFourth = new Date(year, 0, 4);
  const day = januaryFourth.getDay() || 7;
  const mondayOfWeekOne = new Date(januaryFourth);
  mondayOfWeekOne.setDate(januaryFourth.getDate() - day + 1);
  const start = new Date(mondayOfWeekOne);
  start.setDate(mondayOfWeekOne.getDate() + (week - 1) * 7);
  return start;
};

const formatShortDate = (value: Date): string =>
  new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' }).format(value);

const parseWeeklyKey = (periodKey: string): { year: number; week: number } | null => {
  const match = periodKey.match(/^(\d{4})-W(\d{1,2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const week = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(week)) {
    return null;
  }

  return { year, week };
};

const parseMonthlyKey = (periodKey: string): { year: number; month: number } | null => {
  const match = periodKey.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return null;
  }

  return { year, month };
};

const currentYear = new Date().getFullYear();

interface SummaryRow {
  key: string;
  periodLabel: string;
  totalEarned: number;
  totalPaid: number;
  pending: number;
}

export const LabourRecordsPage = () => {
  const [labourers, setLabourers] = useState<LabourerSummary[]>([]);
  const [entries, setEntries] = useState<LabourEntry[]>([]);
  const [summaries, setSummaries] = useState<LabourSummaryResponse>({ weekly: [], monthly: [] });
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<EntrySort>('date');
  const [entryTypeFilter, setEntryTypeFilter] = useState<EntryTypeFilter>('ALL');
  const [selectedLabourerId, setSelectedLabourerId] = useState<number>(0);
  const [selectedMonth, setSelectedMonth] = useState<string>(toMonthKey(new Date()));
  const [monthOptions] = useState<string[]>(() => buildMonthOptions());
  const [activeView, setActiveView] = useState<'ENTRIES' | 'SUMMARY'>('ENTRIES');
  const [summaryMode, setSummaryMode] = useState<SummaryMode>('MONTHLY');
  const [summaryYear, setSummaryYear] = useState<number>(currentYear);
  const [summaryMonthFilter, setSummaryMonthFilter] = useState<number | 'ALL'>('ALL');
  const [toast, setToast] = useState('');
  const currentMonthKey = toMonthKey(new Date());

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(''), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const loadData = async (labourerId?: number) => {
    try {
      const [labourerData, entryData, summaryData] = await Promise.all([
        window.api.listLabourers(),
        window.api.listLabourEntries(labourerId),
        window.api.getLabourSummaries(labourerId),
      ]);
      setLabourers(labourerData);
      setEntries(entryData);
      setSummaries(summaryData);
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Failed to load labour records.');
    }
  };

  useEffect(() => {
    void loadData(selectedLabourerId || undefined);
  }, [selectedLabourerId]);

  const selectedWorkerName = useMemo(() => {
    if (!selectedLabourerId) {
      return 'All workers';
    }
    return labourers.find((labourer) => labourer.id === selectedLabourerId)?.name ?? 'Selected worker';
  }, [labourers, selectedLabourerId]);

  const visibleEntries = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const monthFiltered = entries.filter(
      (entry) => entry.entryDate.startsWith(selectedMonth) && (entryTypeFilter === 'ALL' || entry.entryType === entryTypeFilter),
    );
    const filtered = keyword
      ? monthFiltered.filter(
          (entry) =>
            entry.entryDate.includes(keyword) ||
            entry.labourerName.toLowerCase().includes(keyword) ||
            entry.entryType.toLowerCase().includes(keyword) ||
            (entry.paymentAccountName ?? '').toLowerCase().includes(keyword) ||
            (entry.note ?? '').toLowerCase().includes(keyword),
        )
      : [...monthFiltered];

    filtered.sort((left, right) => {
      let compare = 0;
      if (sortBy === 'date') {
        compare = left.entryDate.localeCompare(right.entryDate);
      } else if (sortBy === 'amount') {
        compare = left.amount - right.amount;
      } else if (sortBy === 'name') {
        compare = left.labourerName.localeCompare(right.labourerName);
      } else {
        compare = left.entryType.localeCompare(right.entryType);
      }
      return -compare;
    });

    return filtered;
  }, [entries, search, selectedMonth, sortBy, entryTypeFilter]);

  const hasSearch = search.trim().length > 0;
  const hasWorkerFilter = selectedLabourerId !== 0;
  const hasMonthFilter = selectedMonth !== currentMonthKey;

  const summaryYearOptions = useMemo(() => {
    const years = new Set<number>([currentYear]);

    summaries.weekly.forEach((item) => {
      const parsed = parseWeeklyKey(item.periodKey);
      if (parsed) {
        years.add(parsed.year);
      }
    });

    summaries.monthly.forEach((item) => {
      const parsed = parseMonthlyKey(item.periodKey);
      if (parsed) {
        years.add(parsed.year);
      }
    });

    return [...years].sort((left, right) => right - left);
  }, [summaries.monthly, summaries.weekly]);

  const summaryRows = useMemo<SummaryRow[]>(() => {
    if (summaryMode === 'MONTHLY') {
      return summaries.monthly
        .map((item) => {
          const parsed = parseMonthlyKey(item.periodKey);
          if (!parsed) {
            return null;
          }

          if (parsed.year !== summaryYear) {
            return null;
          }

          if (summaryMonthFilter !== 'ALL' && parsed.month !== summaryMonthFilter) {
            return null;
          }

          const label = new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric' }).format(
            new Date(parsed.year, parsed.month - 1, 1),
          );

          return {
            key: item.periodKey,
            periodLabel: label,
            totalEarned: item.totalEarned,
            totalPaid: item.totalPaid,
            pending: item.pending,
          };
        })
        .filter((item): item is SummaryRow => item !== null)
        .sort((left, right) => right.key.localeCompare(left.key));
    }

    return summaries.weekly
      .map((item) => {
        const parsed = parseWeeklyKey(item.periodKey);
        if (!parsed || parsed.year !== summaryYear) {
          return null;
        }

        const startDate = getIsoWeekStartDate(parsed.year, parsed.week);
        const endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);

        if (
          summaryMonthFilter !== 'ALL' &&
          startDate.getMonth() + 1 !== summaryMonthFilter &&
          endDate.getMonth() + 1 !== summaryMonthFilter
        ) {
          return null;
        }

        return {
          key: item.periodKey,
          periodLabel: `Week ${String(parsed.week).padStart(2, '0')} (${formatShortDate(startDate)} - ${formatShortDate(endDate)})`,
          totalEarned: item.totalEarned,
          totalPaid: item.totalPaid,
          pending: item.pending,
        };
      })
      .filter((item): item is SummaryRow => item !== null)
      .sort((left, right) => right.key.localeCompare(left.key));
  }, [summaries.monthly, summaries.weekly, summaryMode, summaryMonthFilter, summaryYear]);

  const summaryTotals = useMemo(
    () =>
      summaryRows.reduce(
        (accumulator, item) => {
          accumulator.earned += item.totalEarned;
          accumulator.paid += item.totalPaid;
          accumulator.pending += item.pending;
          return accumulator;
        },
        { earned: 0, paid: 0, pending: 0 },
      ),
    [summaryRows],
  );

  const summaryMonthOptions = useMemo(() => {
    return Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      const label = new Intl.DateTimeFormat('en-IN', { month: 'long' }).format(new Date(2026, index, 1));
      return { month, label };
    });
  }, []);

  return (
    <div className={styles.sectionGrid}>
      <div key={activeView} className={styles.viewTransitionPane}>
      {activeView === 'SUMMARY' ? (
        <article className={styles.panel}>
          <div className={styles.iconToolbar}>
            <button type="button" className={`${styles.button} ${styles.buttonPrimary}`} onClick={() => setActiveView('ENTRIES')}>
              ← Back to Labour Entries
            </button>
            <div>
              <h2 className={styles.panelTitle}>Workers Summary</h2>
              <p className={styles.panelText}>Current year summary by week/month. Worker: {selectedWorkerName}</p>
            </div>
          </div>

          <div className={styles.reportFiltersGrid}>
            <label className={styles.reportFilterField}>
              <span className={styles.reportFilterLabel}>Worker</span>
              <select
                className={`${styles.reportFilterSelect} ${hasWorkerFilter ? styles.reportFilterSelectActive : ''}`}
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
            </label>

            <label className={styles.reportFilterField}>
              <span className={styles.reportFilterLabel}>Summary Type</span>
              <select
                className={styles.reportFilterSelect}
                value={summaryMode}
                onChange={(event) => setSummaryMode(event.target.value as SummaryMode)}
              >
                <option value="MONTHLY">Monthly</option>
                <option value="WEEKLY">Weekly</option>
              </select>
            </label>

            <label className={styles.reportFilterField}>
              <span className={styles.reportFilterLabel}>Year</span>
              <select
                className={`${styles.reportFilterSelect} ${summaryYear !== currentYear ? styles.reportFilterSelectActive : ''}`}
                value={summaryYear}
                onChange={(event) => setSummaryYear(Number(event.target.value))}
              >
                {summaryYearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.reportFilterField}>
              <span className={styles.reportFilterLabel}>Month</span>
              <select
                className={`${styles.reportFilterSelect} ${summaryMonthFilter !== 'ALL' ? styles.reportFilterSelectActive : ''}`}
                value={summaryMonthFilter}
                onChange={(event) => {
                  if (event.target.value === 'ALL') {
                    setSummaryMonthFilter('ALL');
                    return;
                  }
                  setSummaryMonthFilter(Number(event.target.value));
                }}
              >
                <option value="ALL">All Months</option>
                {summaryMonthOptions.map((option) => (
                  <option key={option.month} value={option.month}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className={styles.summaryGrid}>
            <div className={styles.summaryCard}>
              <p className={styles.summaryLabel}>Total Earned</p>
              <p className={`${styles.summaryValue} ${styles.amountPositive}`}>{currency.format(summaryTotals.earned)}</p>
            </div>
            <div className={styles.summaryCard}>
              <p className={styles.summaryLabel}>Total Paid</p>
              <p className={`${styles.summaryValue} ${styles.amountNegative}`}>{currency.format(summaryTotals.paid)}</p>
            </div>
            <div className={styles.summaryCard}>
              <p className={styles.summaryLabel}>Net Position</p>
              <p className={`${styles.summaryValue} ${amountClassName(summaryTotals.pending)}`}>
                {signedCurrency(summaryTotals.pending)}
              </p>
            </div>
          </div>

          <div className={styles.tableWrapTall}>
            <table className={`${styles.table} ${styles.reportTable}`}>
              <thead className={styles.tableHeadSticky}>
                <tr>
                  <th>{summaryMode === 'MONTHLY' ? 'Month' : 'Week'}</th>
                  <th className={styles.numberCell}>Earned</th>
                  <th className={styles.numberCell}>Paid</th>
                  <th className={styles.numberCell}>Net Position</th>
                </tr>
              </thead>
              <tbody>
                {summaryRows.map((summary) => (
                  <tr key={summary.key} className={styles.reportTableRow}>
                    <td>{summary.periodLabel}</td>
                    <td className={styles.numberCell}>{currency.format(summary.totalEarned)}</td>
                    <td className={styles.numberCell}>{currency.format(summary.totalPaid)}</td>
                    <td className={`${styles.numberCell} ${amountClassName(summary.pending)}`}>{signedCurrency(summary.pending)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!summaryRows.length ? <p className={styles.emptyText}>No summary records for selected filters.</p> : null}
          <p className={styles.valueHint}>+ means you owe workers, - means workers owe you.</p>
        </article>
      ) : (
        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Labour Entries</h2>
            <div className={styles.formActions}>
              <button type="button" className={`${styles.button} ${styles.buttonPrimary}`} onClick={() => setActiveView('SUMMARY')}>
                View Summary
              </button>
              <button
                type="button"
                className={styles.button}
                onClick={() => {
                  setSearch('');
                  setSortBy('date');
                  setEntryTypeFilter('ALL');
                  setSelectedMonth(toMonthKey(new Date()));
                  setSelectedLabourerId(0);
                }}
              >
                Reset Filters
              </button>
            </div>
          </div>

          <p className={styles.panelText}>Filter and review labour entries in one clean table.</p>

          <div className={styles.reportFiltersGrid}>
            <label className={styles.reportFilterField}>
              <span className={styles.reportFilterLabel}>Worker</span>
              <select
                className={`${styles.reportFilterSelect} ${hasWorkerFilter ? styles.reportFilterSelectActive : ''}`}
                value={selectedLabourerId}
                onChange={(event) => setSelectedLabourerId(Number(event.target.value))}
                title="Filter by worker"
                aria-label="Filter by worker"
              >
                <option value={0}>All workers</option>
                {labourers.map((labourer) => (
                  <option key={labourer.id} value={labourer.id}>
                    {labourer.name}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.reportFilterField}>
              <span className={styles.reportFilterLabel}>Month</span>
              <select
                className={`${styles.reportFilterSelect} ${hasMonthFilter ? styles.reportFilterSelectActive : ''}`}
                value={selectedMonth}
                onChange={(event) => setSelectedMonth(event.target.value)}
              >
                {monthOptions.map((month) => (
                  <option key={month} value={month}>
                    {formatMonthLabel(month)}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.reportFilterField}>
              <span className={styles.reportFilterLabel}>Search</span>
              <input
                className={`${styles.reportFilterSelect} ${hasSearch ? styles.reportFilterSelectActive : ''}`}
                placeholder="Search records"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>

            <label className={styles.reportFilterField}>
              <span className={styles.reportFilterLabel}>Sort By</span>
              <select
                className={styles.reportFilterSelect}
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as EntrySort)}
              >
                <option value="date">Date</option>
                <option value="name">Name</option>
                <option value="type">Type</option>
                <option value="amount">Amount</option>
              </select>
            </label>

            <label className={styles.reportFilterField}>
              <span className={styles.reportFilterLabel}>Entry Type</span>
              <select
                className={`${styles.reportFilterSelect} ${entryTypeFilter !== 'ALL' ? styles.reportFilterSelectActive : ''}`}
                value={entryTypeFilter}
                onChange={(event) => setEntryTypeFilter(event.target.value as EntryTypeFilter)}
              >
                <option value="ALL">All Types</option>
                <option value="WAGE">Wage</option>
                <option value="ADVANCE">Advance</option>
                <option value="PAYMENT">Payment</option>
              </select>
            </label>
          </div>

          <p className={styles.valueHint}>Showing records for selected worker: {selectedWorkerName}</p>
          <div className={styles.feedbackRow}>
            <span className={styles.feedbackCount}>{visibleEntries.length} records shown</span>
            <div className={styles.feedbackChips}>
              <span
                className={`${styles.feedbackChip} ${hasWorkerFilter ? styles.feedbackChipActive : ''}`}
              >
                Worker: {selectedWorkerName}
              </span>
              <span
                className={`${styles.feedbackChip} ${hasMonthFilter ? styles.feedbackChipActive : ''}`}
              >
                Month: {formatMonthLabel(selectedMonth)}
              </span>
              <span className={`${styles.feedbackChip} ${hasSearch ? styles.feedbackChipActive : ''}`}>
                Search: {hasSearch ? search.trim() : 'None'}
              </span>
              <span className={`${styles.feedbackChip} ${entryTypeFilter !== 'ALL' ? styles.feedbackChipActive : ''}`}>
                Type: {entryTypeFilter === 'ALL' ? 'All' : entryTypeFilter}
              </span>
              <span className={styles.feedbackChip}>Sort: {sortBy} (desc)</span>
            </div>
          </div>

          <div className={styles.tableWrapTall}>
            <table className={`${styles.table} ${styles.reportTable}`}>
              <thead className={styles.tableHeadSticky}>
                <tr>
                  <th>Date</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Bank</th>
                  <th className={styles.numberCell}>Amount</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {visibleEntries.map((entry) => (
                  <tr key={entry.id} className={styles.reportTableRow}>
                    <td>{entry.entryDate}</td>
                    <td>{entry.labourerName}</td>
                    <td>
                      <span className={entryTypePillClass(entry.entryType)}>{entry.entryType}</span>
                    </td>
                    <td>{entry.paymentAccountName ?? '-'}</td>
                    <td className={`${styles.numberCell} ${entryAmountClass(entry.entryType)}`}>
                      {signedEntryAmount(entry)}
                    </td>
                    <td className={styles.reportNoteCell}>{entry.note ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!visibleEntries.length ? <p className={styles.emptyText}>No entries for selected month.</p> : null}
        </article>
      )}
      </div>

      {toast ? <div className={styles.toast}>{toast}</div> : null}
    </div>
  );
};
