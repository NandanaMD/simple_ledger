export type AccountType = 'BANK' | 'CASH' | 'WALLET';

export interface Account {
  id: number;
  name: string;
  accountType: AccountType;
  openingBalance: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountWithBalance extends Account {
  currentBalance: number;
}

export interface AccountInput {
  name: string;
  accountType: AccountType;
  openingBalance: number;
  notes?: string;
}

export type CategoryType = 'INCOME' | 'EXPENSE';

export interface Category {
  id: number;
  name: string;
  categoryType: CategoryType;
  parentId: number | null;
  parentName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryInput {
  name: string;
  categoryType: CategoryType;
  parentId?: number;
}

export type TransactionType = 'INCOME' | 'EXPENSE' | 'TRANSFER';

export interface LedgerTransaction {
  id: number;
  transactionType: TransactionType;
  accountId: number;
  accountName: string;
  toAccountId: number | null;
  toAccountName: string | null;
  categoryId: number | null;
  categoryName: string | null;
  amount: number;
  transactionDate: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionInput {
  transactionType: TransactionType;
  accountId: number;
  toAccountId?: number;
  categoryId?: number;
  amount: number;
  transactionDate: string;
  note?: string;
}

export type LabourEntryType = 'WAGE' | 'ADVANCE' | 'PAYMENT';

export interface Labourer {
  id: number;
  name: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LabourerInput {
  name: string;
  notes?: string;
}

export interface LabourerSummary extends Labourer {
  totalEarned: number;
  totalPaid: number;
  pending: number;
}

export interface LabourEntry {
  id: number;
  labourerId: number;
  labourerName: string;
  entryType: LabourEntryType;
  amount: number;
  entryDate: string;
  note: string | null;
  paymentAccountId: number | null;
  paymentAccountName: string | null;
  linkedTransactionId: number | null;
  createdAt: string;
}

export interface LabourEntryInput {
  labourerId: number;
  entryType: LabourEntryType;
  amount: number;
  entryDate: string;
  note?: string;
  paymentAccountId?: number;
}

export interface PeriodSummary {
  periodKey: string;
  totalEarned: number;
  totalPaid: number;
  pending: number;
}

export interface LabourSummaryResponse {
  weekly: PeriodSummary[];
  monthly: PeriodSummary[];
}

export interface DashboardMonthlyBreakdown {
  monthKey: string;
  income: number;
  expense: number;
  net: number;
}

export interface DashboardSummary {
  totalNetBalance: number;
  thisMonthIncome: number;
  thisMonthExpense: number;
  totalLabourPending: number;
  monthlyBreakdown: DashboardMonthlyBreakdown[];
}

export type ExportFormat = 'PDF' | 'CSV';

export type ExportDataset = 'TRANSACTIONS' | 'LABOUR' | 'ACCOUNTS';

export type ExportPeriod = 'THIS_MONTH' | 'LAST_3_MONTHS' | 'THIS_YEAR' | 'ALL';

export interface ExportRequest {
  format: ExportFormat;
  dataset: ExportDataset;
  period: ExportPeriod;
}

export interface ExportResult {
  filePath: string;
  format: ExportFormat;
  rowCount: number;
}