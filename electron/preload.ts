import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronApi } from '../src/shared/types/electron-api';
import type { UpdaterStatus } from '../src/shared/types/update';

const api: ElectronApi = {
  ping: () => ipcRenderer.invoke('app:ping'),
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  listAccounts: () => ipcRenderer.invoke('accounts:list'),
  createAccount: (payload) => ipcRenderer.invoke('accounts:create', payload),
  updateAccount: (id, payload) => ipcRenderer.invoke('accounts:update', id, payload),
  deleteAccount: (id) => ipcRenderer.invoke('accounts:delete', id),
  listCategories: () => ipcRenderer.invoke('categories:list'),
  createCategory: (payload) => ipcRenderer.invoke('categories:create', payload),
  updateCategory: (id, payload) => ipcRenderer.invoke('categories:update', id, payload),
  deleteCategory: (id) => ipcRenderer.invoke('categories:delete', id),
  listTransactions: () => ipcRenderer.invoke('transactions:list'),
  createTransaction: (payload) => ipcRenderer.invoke('transactions:create', payload),
  updateTransaction: (id, payload) => ipcRenderer.invoke('transactions:update', id, payload),
  deleteTransaction: (id) => ipcRenderer.invoke('transactions:delete', id),
  listLabourers: () => ipcRenderer.invoke('labourers:list'),
  createLabourer: (payload) => ipcRenderer.invoke('labourers:create', payload),
  updateLabourer: (id, payload) => ipcRenderer.invoke('labourers:update', id, payload),
  deleteLabourer: (id) => ipcRenderer.invoke('labourers:delete', id),
  listLabourEntries: (labourerId) => ipcRenderer.invoke('labour-entries:list', labourerId),
  createLabourEntry: (payload) => ipcRenderer.invoke('labour-entries:create', payload),
  updateLabourEntry: (id, payload) => ipcRenderer.invoke('labour-entries:update', id, payload),
  deleteLabourEntry: (id) => ipcRenderer.invoke('labour-entries:delete', id),
  getLabourSummaries: (labourerId) => ipcRenderer.invoke('labour:summaries', labourerId),
  getDashboardSummary: () => ipcRenderer.invoke('dashboard:summary'),
  exportRecords: (payload) => ipcRenderer.invoke('export:records', payload),
  openExportFile: (filePath) => ipcRenderer.invoke('export:open-file', filePath),
  getUpdaterStatus: () => ipcRenderer.invoke('updater:status'),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  onUpdaterStatus: (listener) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, status: UpdaterStatus) => {
      listener(status);
    };

    ipcRenderer.on('updater:status', wrappedListener);

    return () => {
      ipcRenderer.removeListener('updater:status', wrappedListener);
    };
  },
};

contextBridge.exposeInMainWorld('api', api);
