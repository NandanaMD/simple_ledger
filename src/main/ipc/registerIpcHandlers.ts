import { ipcMain } from 'electron';
import { getAppVersion, ping } from '../services/HealthService.js';
import {
  createAccount,
  deleteAccount,
  listAccounts,
  updateAccount,
} from '../services/AccountService.js';
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from '../services/CategoryService.js';
import {
  createTransaction,
  deleteTransaction,
  listTransactions,
  updateTransaction,
} from '../services/TransactionService.js';
import { getDashboardSummary } from '../services/DashboardService.js';
import { exportRecords, openExportFile } from '../services/ExportService.js';
import { backupDatabase, restoreDatabase } from '../services/BackupService.js';
import {
  checkForAppUpdates,
  downloadAppUpdate,
  getUpdaterStatusSnapshot,
  installDownloadedUpdate,
} from '../services/UpdateService.js';
import {
  createLabourEntry,
  createLabourer,
  deleteLabourEntry,
  deleteLabourer,
  getLabourSummaries,
  listLabourEntries,
  listLabourers,
  updateLabourEntry,
  updateLabourer,
} from '../services/LabourService.js';
import type {
  AccountInput,
  CategoryInput,
  ExportRequest,
  LabourEntryInput,
  LabourerInput,
  TransactionInput,
} from '../../shared/types/ledger.js';

export const registerIpcHandlers = (): void => {
  ipcMain.handle('app:ping', async () => ping());
  ipcMain.handle('app:version', async () => getAppVersion());

  ipcMain.handle('accounts:list', async () => listAccounts());
  ipcMain.handle('accounts:create', async (_event, payload: AccountInput) => createAccount(payload));
  ipcMain.handle('accounts:update', async (_event, id: number, payload: AccountInput) =>
    updateAccount(id, payload),
  );
  ipcMain.handle('accounts:delete', async (_event, id: number) => deleteAccount(id));

  ipcMain.handle('categories:list', async () => listCategories());
  ipcMain.handle('categories:create', async (_event, payload: CategoryInput) => createCategory(payload));
  ipcMain.handle('categories:update', async (_event, id: number, payload: CategoryInput) =>
    updateCategory(id, payload),
  );
  ipcMain.handle('categories:delete', async (_event, id: number) => deleteCategory(id));

  ipcMain.handle('transactions:list', async () => listTransactions());
  ipcMain.handle('transactions:create', async (_event, payload: TransactionInput) =>
    createTransaction(payload),
  );
  ipcMain.handle('transactions:update', async (_event, id: number, payload: TransactionInput) =>
    updateTransaction(id, payload),
  );
  ipcMain.handle('transactions:delete', async (_event, id: number) => deleteTransaction(id));

  ipcMain.handle('labourers:list', async () => listLabourers());
  ipcMain.handle('labourers:create', async (_event, payload: LabourerInput) => createLabourer(payload));
  ipcMain.handle('labourers:update', async (_event, id: number, payload: LabourerInput) =>
    updateLabourer(id, payload),
  );
  ipcMain.handle('labourers:delete', async (_event, id: number) => deleteLabourer(id));

  ipcMain.handle('labour-entries:list', async (_event, labourerId?: number) =>
    listLabourEntries(labourerId),
  );
  ipcMain.handle('labour-entries:create', async (_event, payload: LabourEntryInput) =>
    createLabourEntry(payload),
  );
  ipcMain.handle('labour-entries:update', async (_event, id: number, payload: LabourEntryInput) =>
    updateLabourEntry(id, payload),
  );
  ipcMain.handle('labour-entries:delete', async (_event, id: number) => deleteLabourEntry(id));

  ipcMain.handle('labour:summaries', async (_event, labourerId?: number) => getLabourSummaries(labourerId));
  ipcMain.handle('dashboard:summary', async () => getDashboardSummary());
  ipcMain.handle('export:records', async (_event, payload: ExportRequest) => exportRecords(payload));
  ipcMain.handle('export:open-file', async (_event, filePath: string) => openExportFile(filePath));
  ipcMain.handle('backup:create', async () => backupDatabase());
  ipcMain.handle('backup:restore', async () => restoreDatabase());

  ipcMain.handle('updater:status', async () => getUpdaterStatusSnapshot());
  ipcMain.handle('updater:check', async () => checkForAppUpdates());
  ipcMain.handle('updater:download', async () => downloadAppUpdate());
  ipcMain.handle('updater:install', async () => installDownloadedUpdate());
};
