import { getDatabase } from '../db/DatabaseClient.js';
import type { DashboardMonthlyBreakdown, DashboardSummary } from '../../shared/types/ledger.js';

interface BreakdownRow {
  month_key: string;
  income: number;
  expense: number;
}

const toMonthKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const buildMonthKeys = (count: number): string[] => {
  const now = new Date();
  const keys: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - index, 1);
    keys.push(toMonthKey(monthDate));
  }

  return keys;
};

export const getDashboardSummary = async (): Promise<DashboardSummary> => {
  const database = getDatabase();
  const monthKeys = buildMonthKeys(6);
  const currentMonthKey = monthKeys[0];
  const oldestMonthKey = monthKeys[monthKeys.length - 1];

  const accountRow = database
    .prepare(
      `SELECT
        COALESCE(SUM(opening_balance), 0) AS opening_total
       FROM accounts;`,
    )
    .get() as { opening_total: number };

  const transactionNetRow = database
    .prepare(
      `SELECT
        COALESCE(SUM(
          CASE
            WHEN transaction_type = 'INCOME' THEN amount
            WHEN transaction_type = 'EXPENSE' THEN -amount
            ELSE 0
          END
        ), 0) AS transactions_net
       FROM transactions;`,
    )
    .get() as { transactions_net: number };

  const labourPendingRow = database
    .prepare(
      `SELECT
        COALESCE(SUM(CASE WHEN entry_type = 'WAGE' THEN amount ELSE 0 END), 0) AS total_earned,
        COALESCE(SUM(CASE WHEN entry_type IN ('ADVANCE', 'PAYMENT') THEN amount ELSE 0 END), 0) AS total_paid
       FROM labour_entries;`,
    )
    .get() as { total_earned: number; total_paid: number };

  const monthRows = database
    .prepare(
      `SELECT
        substr(transaction_date, 1, 7) AS month_key,
        COALESCE(SUM(CASE WHEN transaction_type = 'INCOME' THEN amount ELSE 0 END), 0) AS income,
        COALESCE(SUM(CASE WHEN transaction_type = 'EXPENSE' THEN amount ELSE 0 END), 0) AS expense
       FROM transactions
       WHERE substr(transaction_date, 1, 7) >= ?
       GROUP BY month_key;`,
    )
    .all(oldestMonthKey) as BreakdownRow[];

  const monthMap = new Map<string, BreakdownRow>();
  monthRows.forEach((row) => {
    monthMap.set(row.month_key, row);
  });

  const monthlyBreakdown: DashboardMonthlyBreakdown[] = monthKeys.map((monthKey) => {
    const row = monthMap.get(monthKey);
    const income = row?.income ?? 0;
    const expense = row?.expense ?? 0;

    return {
      monthKey,
      income,
      expense,
      net: income - expense,
    };
  });

  const currentMonth = monthMap.get(currentMonthKey);

  return {
    totalNetBalance: accountRow.opening_total + transactionNetRow.transactions_net,
    thisMonthIncome: currentMonth?.income ?? 0,
    thisMonthExpense: currentMonth?.expense ?? 0,
    totalLabourPending: labourPendingRow.total_earned - labourPendingRow.total_paid,
    monthlyBreakdown,
  };
};
