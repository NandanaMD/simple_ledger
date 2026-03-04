import type {
  AccountInput,
  AccountWithBalance,
  Category,
  CategoryInput,
  ExportRequest,
  ExportResult,
  BackupResult,
  RestoreResult,
  LabourEntry,
  LabourEntryInput,
  DashboardSummary,
  LabourSummaryResponse,
  LabourerInput,
  LabourerSummary,
  LedgerTransaction,
  TransactionInput,
} from './ledger';
import type { UpdaterStatus } from './update';

export interface ElectronApi {
  ping: () => Promise<string>;
  getAppVersion: () => Promise<string>;
  listAccounts: () => Promise<AccountWithBalance[]>;
  createAccount: (payload: AccountInput) => Promise<AccountWithBalance>;
  updateAccount: (id: number, payload: AccountInput) => Promise<AccountWithBalance>;
  deleteAccount: (id: number) => Promise<void>;
  listCategories: () => Promise<Category[]>;
  createCategory: (payload: CategoryInput) => Promise<Category>;
  updateCategory: (id: number, payload: CategoryInput) => Promise<Category>;
  deleteCategory: (id: number) => Promise<void>;
  listTransactions: () => Promise<LedgerTransaction[]>;
  createTransaction: (payload: TransactionInput) => Promise<LedgerTransaction>;
  updateTransaction: (id: number, payload: TransactionInput) => Promise<LedgerTransaction>;
  deleteTransaction: (id: number) => Promise<void>;
  listLabourers: () => Promise<LabourerSummary[]>;
  createLabourer: (payload: LabourerInput) => Promise<LabourerSummary>;
  updateLabourer: (id: number, payload: LabourerInput) => Promise<LabourerSummary>;
  deleteLabourer: (id: number) => Promise<void>;
  listLabourEntries: (labourerId?: number) => Promise<LabourEntry[]>;
  createLabourEntry: (payload: LabourEntryInput) => Promise<LabourEntry>;
  updateLabourEntry: (id: number, payload: LabourEntryInput) => Promise<LabourEntry>;
  deleteLabourEntry: (id: number) => Promise<void>;
  getLabourSummaries: (labourerId?: number) => Promise<LabourSummaryResponse>;
  getDashboardSummary: () => Promise<DashboardSummary>;
  exportRecords: (payload: ExportRequest) => Promise<ExportResult>;
  openExportFile: (filePath: string) => Promise<void>;
  backupDatabase: () => Promise<BackupResult>;
  restoreDatabase: () => Promise<RestoreResult>;
  getUpdaterStatus: () => Promise<UpdaterStatus>;
  checkForUpdates: () => Promise<UpdaterStatus>;
  downloadUpdate: () => Promise<UpdaterStatus>;
  installUpdate: () => Promise<void>;
  onUpdaterStatus: (listener: (status: UpdaterStatus) => void) => () => void;
}
