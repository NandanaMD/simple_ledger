import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import App from './App.tsx'
import type { ElectronApi } from './shared/types/electron-api'
import type { UpdaterStatus } from './shared/types/update'

const bridgeErrorMessage =
  'Desktop API bridge is unavailable or outdated. Restart the app after running a fresh electron build.'

const rejectCall = <T,>() => Promise.reject(new Error(bridgeErrorMessage)) as Promise<T>

const rejectUpdaterCall = () =>
  Promise.reject(new Error(bridgeErrorMessage)) as Promise<UpdaterStatus>

const fallbackApi: ElectronApi = {
  ping: () => rejectCall<string>(),
  getAppVersion: () => rejectCall<string>(),
  listAccounts: () => rejectCall(),
  createAccount: () => rejectCall(),
  updateAccount: () => rejectCall(),
  deleteAccount: () => rejectCall(),
  listCategories: () => rejectCall(),
  createCategory: () => rejectCall(),
  updateCategory: () => rejectCall(),
  deleteCategory: () => rejectCall(),
  listTransactions: () => rejectCall(),
  createTransaction: () => rejectCall(),
  updateTransaction: () => rejectCall(),
  deleteTransaction: () => rejectCall(),
  listLabourers: () => rejectCall(),
  createLabourer: () => rejectCall(),
  updateLabourer: () => rejectCall(),
  deleteLabourer: () => rejectCall(),
  listLabourEntries: () => rejectCall(),
  createLabourEntry: () => rejectCall(),
  updateLabourEntry: () => rejectCall(),
  deleteLabourEntry: () => rejectCall(),
  getLabourSummaries: () => rejectCall(),
  getDashboardSummary: () => rejectCall(),
  exportRecords: () => rejectCall(),
  openExportFile: () => rejectCall(),
  getUpdaterStatus: () => rejectUpdaterCall(),
  checkForUpdates: () => rejectUpdaterCall(),
  downloadUpdate: () => rejectUpdaterCall(),
  installUpdate: () => rejectCall(),
  onUpdaterStatus: () => () => {},
}

if (!window.api) {
  window.api = fallbackApi
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
