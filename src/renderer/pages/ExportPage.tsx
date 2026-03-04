import { useEffect, useMemo, useState } from 'react';
import type {
  ExportDataset,
  ExportFormat,
  ExportPeriod,
  ExportResult,
} from '../../shared/types/ledger';
import styles from './LedgerPage.module.css';

type ExportTab = 'EXPORT' | 'HISTORY';

interface ExportHistoryItem {
  id: string;
  timestamp: string;
  dataset: ExportDataset;
  format: ExportFormat;
  period: ExportPeriod;
  rowCount: number;
  filePath: string;
}

const historyStorageKey = 'simple-ledger-export-history-v1';

const datasetLabels: Record<ExportDataset, string> = {
  TRANSACTIONS: 'Transactions',
  LABOUR: 'Labour Entries',
  ACCOUNTS: 'Accounts',
};

const formatLabels: Record<ExportFormat, string> = {
  PDF: 'PDF (recommended)',
  CSV: 'CSV',
};

const periodLabels: Record<ExportPeriod, string> = {
  THIS_MONTH: 'This Month',
  LAST_3_MONTHS: 'Last 3 Months',
  THIS_YEAR: 'This Year',
  ALL: 'All Time',
};

export const ExportPage = () => {
  const [activeTab, setActiveTab] = useState<ExportTab>('EXPORT');
  const [dataset, setDataset] = useState<ExportDataset>('TRANSACTIONS');
  const [format, setFormat] = useState<ExportFormat>('PDF');
  const [period, setPeriod] = useState<ExportPeriod>('THIS_MONTH');
  const [isExporting, setIsExporting] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [history, setHistory] = useState<ExportHistoryItem[]>([]);
  const [toast, setToast] = useState('');

  const periodDisabled = dataset === 'ACCOUNTS';

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(historyStorageKey);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as ExportHistoryItem[];
      if (Array.isArray(parsed)) {
        setHistory(parsed);
      }
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(historyStorageKey, JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const exportSummary = useMemo(() => {
    const periodText = periodDisabled ? 'All Time (applies to account list)' : periodLabels[period];
    return `${datasetLabels[dataset]} as ${formatLabels[format]} for ${periodText}`;
  }, [dataset, format, period, periodDisabled]);

  const onExport = async () => {
    try {
      setIsExporting(true);
      setResult(null);

      const exportResult = await window.api.exportRecords({
        dataset,
        format,
        period: periodDisabled ? 'ALL' : period,
      });

      const record: ExportHistoryItem = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        dataset,
        format,
        period: periodDisabled ? 'ALL' : period,
        rowCount: exportResult.rowCount,
        filePath: exportResult.filePath,
      };

      setHistory((previous) => [record, ...previous].slice(0, 50));

      setResult(exportResult);
      setToast('Export completed successfully.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to export records.';
      if (message.toLowerCase().includes('cancelled')) {
        setToast('Export cancelled.');
      } else {
        setToast(message);
      }
    } finally {
      setIsExporting(false);
    }
  };

  const openHistoryFile = async (filePath: string) => {
    try {
      await window.api.openExportFile(filePath);
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Unable to open file.');
    }
  };

  const onBackup = async () => {
    try {
      setIsBackingUp(true);
      await window.api.backupDatabase();
      setToast('Backup completed successfully.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create backup.';
      if (message.toLowerCase().includes('cancelled')) {
        setToast('Backup cancelled.');
      } else {
        setToast(message);
      }
    } finally {
      setIsBackingUp(false);
    }
  };

  const onRestore = async () => {
    const confirmed = window.confirm(
      'Restore will replace current ledger data with the selected backup file. Continue?',
    );

    if (!confirmed) {
      return;
    }

    try {
      setIsRestoring(true);
      await window.api.restoreDatabase();
      setToast('Restore completed. Please review your data and restart app if needed.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to restore backup.';
      if (message.toLowerCase().includes('cancelled')) {
        setToast('Restore cancelled.');
      } else {
        setToast(message);
      }
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className={styles.sectionGrid}>
      <article className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2 className={styles.panelTitle}>Export Records</h2>
          <p className={styles.panelText}>Download ledger data in a clean file format.</p>
        </div>

        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Step 1</p>
            <p className={styles.summaryValue}>Choose Data</p>
            <p className={styles.valueHint}>Select what records you want to export.</p>
          </div>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Step 2</p>
            <p className={styles.summaryValue}>Choose Format</p>
            <p className={styles.valueHint}>PDF is default. CSV is optional.</p>
          </div>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Step 3</p>
            <p className={styles.summaryValue}>Save File</p>
            <p className={styles.valueHint}>Pick location and complete export.</p>
          </div>
        </div>
      </article>

      <article className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2 className={styles.panelTitle}>Backup & Restore</h2>
          <p className={styles.panelText}>Use quick actions without entering export flow.</p>
        </div>

        <div className={styles.formActions}>
          <button
            type="button"
            className={styles.button}
            onClick={onBackup}
            disabled={isBackingUp}
          >
            {isBackingUp ? 'Backing up...' : 'Backup Now'}
          </button>

          <button
            type="button"
            className={styles.button}
            onClick={onRestore}
            disabled={isRestoring}
          >
            {isRestoring ? 'Restoring...' : 'Restore Backup'}
          </button>
        </div>
      </article>

      <article className={styles.panel}>
        <div className={styles.segmentedRow} role="tablist" aria-label="Export tabs">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'EXPORT'}
            className={`${styles.segmentButton} ${activeTab === 'EXPORT' ? styles.segmentButtonActive : ''}`}
            onClick={() => setActiveTab('EXPORT')}
          >
            Export
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'HISTORY'}
            className={`${styles.segmentButton} ${activeTab === 'HISTORY' ? styles.segmentButtonActive : ''}`}
            onClick={() => setActiveTab('HISTORY')}
          >
            Export History
          </button>
        </div>
      </article>

      {activeTab === 'EXPORT' ? (
      <article className={styles.panel}>
        <div className={styles.reportFiltersGrid}>
          <label className={styles.reportFilterField}>
            <span className={styles.reportFilterLabel}>Dataset</span>
            <select
              className={styles.reportFilterSelect}
              value={dataset}
              onChange={(event) => setDataset(event.target.value as ExportDataset)}
            >
              <option value="TRANSACTIONS">Transactions</option>
              <option value="LABOUR">Labour Entries</option>
              <option value="ACCOUNTS">Accounts</option>
            </select>
          </label>

          <label className={styles.reportFilterField}>
            <span className={styles.reportFilterLabel}>Format</span>
            <select
              className={styles.reportFilterSelect}
              value={format}
              onChange={(event) => setFormat(event.target.value as ExportFormat)}
            >
              <option value="PDF">PDF (recommended)</option>
              <option value="CSV">CSV</option>
            </select>
          </label>

          <label className={styles.reportFilterField}>
            <span className={styles.reportFilterLabel}>Period</span>
            <select
              className={`${styles.reportFilterSelect} ${periodDisabled ? styles.reportFilterSelectActive : ''}`}
              value={period}
              disabled={periodDisabled}
              onChange={(event) => setPeriod(event.target.value as ExportPeriod)}
            >
              <option value="THIS_MONTH">This Month</option>
              <option value="LAST_3_MONTHS">Last 3 Months</option>
              <option value="THIS_YEAR">This Year</option>
              <option value="ALL">All Time</option>
            </select>
          </label>
        </div>

        <div className={styles.feedbackRow}>
          <p className={styles.valueHint}>Selected export: {exportSummary}</p>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonPrimary} ${styles.buttonPrimaryEmphasis}`}
            onClick={onExport}
            disabled={isExporting}
          >
            {isExporting ? 'Exporting...' : 'Export Now'}
          </button>
        </div>

        {result ? <p className={styles.valueHint}>Last export: {result.format} • {result.rowCount} rows • {result.filePath}</p> : null}
      </article>
      ) : (
      <article className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2 className={styles.panelTitle}>Export History</h2>
          <p className={styles.panelText}>Open previously exported files quickly.</p>
        </div>

        <div className={styles.tableWrapTall}>
          <table className={styles.table}>
            <thead className={styles.tableHeadSticky}>
              <tr>
                <th>Time</th>
                <th>Dataset</th>
                <th>Format</th>
                <th>Period</th>
                <th className={styles.numberCell}>Rows</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {history.map((item) => (
                <tr key={item.id}>
                  <td>{new Date(item.timestamp).toLocaleString('en-IN')}</td>
                  <td>{datasetLabels[item.dataset]}</td>
                  <td>{item.format}</td>
                  <td>{periodLabels[item.period]}</td>
                  <td className={styles.numberCell}>{item.rowCount}</td>
                  <td>
                    <div className={styles.formActions}>
                      <button
                        type="button"
                        className={styles.button}
                        onClick={() => openHistoryFile(item.filePath)}
                      >
                        Open
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!history.length ? <p className={styles.emptyText}>No exports yet.</p> : null}
      </article>
      )}

      {toast ? <div className={styles.toast}>{toast}</div> : null}
    </div>
  );
};
