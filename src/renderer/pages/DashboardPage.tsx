import { useEffect, useMemo, useState } from 'react';
import type { DashboardSummary } from '../../shared/types/ledger';
import styles from './LedgerPage.module.css';

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

const formatMonthLabel = (monthKey: string): string => {
  const [yearRaw, monthRaw] = monthKey.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  return new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric' }).format(
    new Date(year, month - 1, 1),
  );
};

const emptySummary: DashboardSummary = {
  totalNetBalance: 0,
  thisMonthIncome: 0,
  thisMonthExpense: 0,
  totalLabourPending: 0,
  monthlyBreakdown: [],
};

export const DashboardPage = () => {
  const [summary, setSummary] = useState<DashboardSummary>(emptySummary);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => setToast(''), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const loadSummary = async () => {
      try {
        const data = await window.api.getDashboardSummary();
        setSummary(data);
      } catch (error) {
        setToast(error instanceof Error ? error.message : 'Failed to load dashboard summary.');
      } finally {
        setLoading(false);
      }
    };

    void loadSummary();
  }, []);

  const monthlyTotals = useMemo(
    () =>
      summary.monthlyBreakdown.reduce(
        (accumulator, item) => {
          accumulator.income += item.income;
          accumulator.expense += item.expense;
          return accumulator;
        },
        { income: 0, expense: 0 },
      ),
    [summary.monthlyBreakdown],
  );

  return (
    <div className={styles.sectionGrid}>
      <article className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2 className={styles.panelTitle}>Dashboard</h2>
          <p className={styles.panelText}>Quick financial snapshot</p>
        </div>

        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Total Net Balance</p>
            <p
              className={`${styles.summaryValue} ${
                summary.totalNetBalance >= 0 ? styles.amountPositive : styles.amountNegative
              }`}
            >
              {currency.format(summary.totalNetBalance)}
            </p>
          </div>

          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>This Month Income</p>
            <p className={`${styles.summaryValue} ${styles.amountPositive}`}>
              {currency.format(summary.thisMonthIncome)}
            </p>
          </div>

          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>This Month Expense</p>
            <p className={`${styles.summaryValue} ${styles.amountNegative}`}>
              {currency.format(summary.thisMonthExpense)}
            </p>
          </div>

          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Total Labour Pending</p>
            <p
              className={`${styles.summaryValue} ${
                summary.totalLabourPending >= 0 ? styles.amountNegative : styles.amountPositive
              }`}
            >
              {currency.format(summary.totalLabourPending)}
            </p>
          </div>
        </div>
      </article>

      <article className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2 className={styles.panelTitle}>Monthly Breakdown</h2>
          <p className={styles.panelText}>Last 6 months (income vs expense)</p>
        </div>

        <div className={styles.tableWrapTall}>
          <table className={styles.table}>
            <thead className={styles.tableHeadSticky}>
              <tr>
                <th>Month</th>
                <th className={styles.numberCell}>Income</th>
                <th className={styles.numberCell}>Expense</th>
                <th className={styles.numberCell}>Net</th>
              </tr>
            </thead>
            <tbody>
              {summary.monthlyBreakdown.map((item) => (
                <tr key={item.monthKey}>
                  <td>{formatMonthLabel(item.monthKey)}</td>
                  <td className={`${styles.numberCell} ${styles.amountPositive}`}>
                    {currency.format(item.income)}
                  </td>
                  <td className={`${styles.numberCell} ${styles.amountNegative}`}>
                    {currency.format(item.expense)}
                  </td>
                  <td
                    className={`${styles.numberCell} ${
                      item.net >= 0 ? styles.amountPositive : styles.amountNegative
                    }`}
                  >
                    {currency.format(item.net)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!summary.monthlyBreakdown.length && !loading ? (
          <p className={styles.emptyText}>No monthly data available yet.</p>
        ) : null}

        <p className={styles.valueHint}>
          6-month totals: Income {currency.format(monthlyTotals.income)} | Expense{' '}
          {currency.format(monthlyTotals.expense)}
        </p>
      </article>

      {toast ? <div className={styles.toast}>{toast}</div> : null}
    </div>
  );
};
