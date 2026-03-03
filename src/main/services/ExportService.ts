import { app, BrowserWindow, dialog, shell } from 'electron';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { getDatabase } from '../db/DatabaseClient.js';
import type {
  ExportDataset,
  ExportFormat,
  ExportPeriod,
  ExportRequest,
  ExportResult,
} from '../../shared/types/ledger.js';

interface TabularData {
  title: string;
  headers: string[];
  rows: string[][];
}

interface ExportDocument {
  title: string;
  sections: TabularData[];
}

const escapeCsv = (value: string): string => {
  const normalized = value.replace(/\r?\n/g, ' ').trim();
  const escaped = normalized.replace(/"/g, '""');
  return /[",]/.test(escaped) ? `"${escaped}"` : escaped;
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const getDateStart = (period: ExportPeriod): string | null => {
  if (period === 'ALL') {
    return null;
  }

  const now = new Date();

  if (period === 'THIS_MONTH') {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  }

  if (period === 'LAST_3_MONTHS') {
    const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`;
  }

  return `${now.getFullYear()}-01-01`;
};

const fetchTransactions = (period: ExportPeriod): ExportDocument => {
  const database = getDatabase();
  const startDate = getDateStart(period);

  const rows = (startDate
    ? database
        .prepare(
          `SELECT
            t.transaction_date,
            t.transaction_type,
            a.name AS account_name,
            COALESCE(ta.name, '') AS to_account_name,
            COALESCE(c.name, '') AS category_name,
            t.amount,
            COALESCE(t.note, '') AS note
           FROM transactions t
           INNER JOIN accounts a ON a.id = t.account_id
           LEFT JOIN accounts ta ON ta.id = t.to_account_id
           LEFT JOIN categories c ON c.id = t.category_id
           WHERE t.transaction_date >= ?
           ORDER BY t.transaction_date DESC, t.id DESC;`,
        )
        .all(startDate)
    : database
        .prepare(
          `SELECT
            t.transaction_date,
            t.transaction_type,
            a.name AS account_name,
            COALESCE(ta.name, '') AS to_account_name,
            COALESCE(c.name, '') AS category_name,
            t.amount,
            COALESCE(t.note, '') AS note
           FROM transactions t
           INNER JOIN accounts a ON a.id = t.account_id
           LEFT JOIN accounts ta ON ta.id = t.to_account_id
           LEFT JOIN categories c ON c.id = t.category_id
           ORDER BY t.transaction_date DESC, t.id DESC;`,
        )
        .all()) as Array<{
    transaction_date: string;
    transaction_type: string;
    account_name: string;
    to_account_name: string;
    category_name: string;
    amount: number;
    note: string;
  }>;

  const summaryRows = (startDate
    ? database
        .prepare(
          `SELECT
            COALESCE(c.name, 'Uncategorized') AS category_name,
            COALESCE(SUM(CASE WHEN t.transaction_type = 'INCOME' THEN t.amount ELSE 0 END), 0) AS income,
            COALESCE(SUM(CASE WHEN t.transaction_type = 'EXPENSE' THEN t.amount ELSE 0 END), 0) AS expense,
            COUNT(*) AS total_count
           FROM transactions t
           LEFT JOIN categories c ON c.id = t.category_id
           WHERE t.transaction_date >= ?
             AND t.transaction_type IN ('INCOME', 'EXPENSE')
           GROUP BY COALESCE(c.name, 'Uncategorized')
           ORDER BY category_name ASC;`,
        )
        .all(startDate)
    : database
        .prepare(
          `SELECT
            COALESCE(c.name, 'Uncategorized') AS category_name,
            COALESCE(SUM(CASE WHEN t.transaction_type = 'INCOME' THEN t.amount ELSE 0 END), 0) AS income,
            COALESCE(SUM(CASE WHEN t.transaction_type = 'EXPENSE' THEN t.amount ELSE 0 END), 0) AS expense,
            COUNT(*) AS total_count
           FROM transactions t
           LEFT JOIN categories c ON c.id = t.category_id
           WHERE t.transaction_type IN ('INCOME', 'EXPENSE')
           GROUP BY COALESCE(c.name, 'Uncategorized')
           ORDER BY category_name ASC;`,
        )
        .all()) as Array<{
    category_name: string;
    income: number;
    expense: number;
    total_count: number;
  }>;

  return {
    title: 'Transactions',
    sections: [
      {
        title: 'Transactions',
        headers: ['Date', 'Type', 'From Account', 'To Account', 'Category', 'Amount', 'Note'],
        rows: rows.map((row) => [
          row.transaction_date,
          row.transaction_type,
          row.account_name,
          row.to_account_name || '-',
          row.category_name || '-',
          row.amount.toFixed(2),
          row.note || '-',
        ]),
      },
      {
        title: 'Category-wise Breakdown',
        headers: ['Category', 'Income Total', 'Expense Total', 'Net', 'Transaction Count'],
        rows: summaryRows.map((row) => [
          row.category_name,
          row.income.toFixed(2),
          row.expense.toFixed(2),
          (row.income - row.expense).toFixed(2),
          String(row.total_count),
        ]),
      },
    ],
  };
};

const fetchLabourEntries = (period: ExportPeriod): ExportDocument => {
  const database = getDatabase();
  const startDate = getDateStart(period);

  const rows = (startDate
    ? database
        .prepare(
          `SELECT
            e.entry_date,
            l.name AS labourer_name,
            e.entry_type,
            COALESCE(a.name, '') AS bank_name,
            e.amount,
            COALESCE(e.note, '') AS note
           FROM labour_entries e
           INNER JOIN labourers l ON l.id = e.labourer_id
           LEFT JOIN accounts a ON a.id = e.payment_account_id
           WHERE e.entry_date >= ?
           ORDER BY e.entry_date DESC, e.id DESC;`,
        )
        .all(startDate)
    : database
        .prepare(
          `SELECT
            e.entry_date,
            l.name AS labourer_name,
            e.entry_type,
            COALESCE(a.name, '') AS bank_name,
            e.amount,
            COALESCE(e.note, '') AS note
           FROM labour_entries e
           INNER JOIN labourers l ON l.id = e.labourer_id
           LEFT JOIN accounts a ON a.id = e.payment_account_id
           ORDER BY e.entry_date DESC, e.id DESC;`,
        )
        .all()) as Array<{
    entry_date: string;
    labourer_name: string;
    entry_type: string;
    bank_name: string;
    amount: number;
    note: string;
  }>;

  return {
    title: 'Labour Entries',
    sections: [
      {
        title: 'Labour Entries',
        headers: ['Date', 'Labourer', 'Entry Type', 'Bank Account', 'Amount', 'Note'],
        rows: rows.map((row) => [
          row.entry_date,
          row.labourer_name,
          row.entry_type,
          row.bank_name || '-',
          row.amount.toFixed(2),
          row.note || '-',
        ]),
      },
    ],
  };
};

const fetchAccounts = (): ExportDocument => {
  const database = getDatabase();

  const rows = database
    .prepare(
      `SELECT
        a.name,
        a.account_type,
        a.opening_balance,
        a.notes,
        a.created_at,
        a.opening_balance + COALESCE(SUM(
          CASE
            WHEN t.transaction_type = 'INCOME' AND t.account_id = a.id THEN t.amount
            WHEN t.transaction_type = 'EXPENSE' AND t.account_id = a.id THEN -t.amount
            WHEN t.transaction_type = 'TRANSFER' AND t.account_id = a.id THEN -t.amount
            WHEN t.transaction_type = 'TRANSFER' AND t.to_account_id = a.id THEN t.amount
            ELSE 0
          END
        ), 0) AS current_balance
       FROM accounts a
       LEFT JOIN transactions t ON t.account_id = a.id OR t.to_account_id = a.id
       GROUP BY a.id
       ORDER BY a.created_at DESC, a.id DESC;`,
    )
    .all() as Array<{
    name: string;
    account_type: string;
    opening_balance: number;
    notes: string | null;
    created_at: string;
    current_balance: number;
  }>;

  return {
    title: 'Accounts',
    sections: [
      {
        title: 'Accounts',
        headers: ['Name', 'Type', 'Opening Balance', 'Current Balance', 'Notes', 'Created At'],
        rows: rows.map((row) => [
          row.name,
          row.account_type,
          row.opening_balance.toFixed(2),
          row.current_balance.toFixed(2),
          row.notes ?? '-',
          row.created_at,
        ]),
      },
    ],
  };
};

const fetchData = (dataset: ExportDataset, period: ExportPeriod): ExportDocument => {
  if (dataset === 'TRANSACTIONS') {
    return fetchTransactions(period);
  }

  if (dataset === 'LABOUR') {
    return fetchLabourEntries(period);
  }

  return fetchAccounts();
};

const buildCsvContent = (document: ExportDocument): string => {
  const chunks = document.sections.map((section) => {
    const allRows = [section.headers, ...section.rows];
    return [`${section.title}`, ...allRows.map((row) => row.map((cell) => escapeCsv(cell)).join(','))].join('\n');
  });

  return chunks.join('\n\n');
};

const buildPdfHtml = (document: ExportDocument): string => {
  const generatedAt = new Date().toLocaleString('en-IN');
  const rowsCount = document.sections.reduce((sum, section) => sum + section.rows.length, 0);
  const sectionsHtml = document.sections
    .map((section) => {
      const headerHtml = section.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('');
      const rowsHtml = section.rows
        .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
        .join('');

      return `<h2>${escapeHtml(section.title)}</h2>
  <table>
    <thead><tr>${headerHtml}</tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>`;
    })
    .join('');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(document.title)} Export</title>
  <style>
    body { font-family: Segoe UI, Arial, sans-serif; margin: 24px; color: #0f172a; }
    h1 { margin: 0 0 6px 0; font-size: 22px; }
    h2 { margin: 16px 0 8px 0; font-size: 16px; color: #1e293b; }
    p.meta { margin: 0 0 16px 0; font-size: 12px; color: #475569; }
    p.meta span { margin-right: 10px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    table + h2 { margin-top: 20px; }
    th, td { border: 1px solid #cbd5e1; padding: 7px 8px; text-align: left; vertical-align: top; }
    th { background: #f1f5f9; font-weight: 700; }
    tr:nth-child(even) td { background: #f8fafc; }
  </style>
</head>
<body>
  <h1>${escapeHtml(document.title)} Export</h1>
  <p class="meta"><span>Generated at: ${escapeHtml(generatedAt)}</span><span>Total Rows: ${rowsCount}</span></p>
  ${sectionsHtml}
</body>
</html>`;
};

const saveBufferAsPdf = async (filePath: string, html: string): Promise<void> => {
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: false } });

  try {
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const buffer = await window.webContents.printToPDF({
      printBackground: true,
      landscape: false,
      pageSize: 'A4',
    });
    await writeFile(filePath, buffer);
  } finally {
    window.destroy();
  }
};

const getSuggestedPath = (dataset: ExportDataset, format: ExportFormat): string => {
  const ext = format === 'PDF' ? 'pdf' : 'csv';
  const stamp = new Date().toISOString().slice(0, 10);
  const name = `simple-ledger-${dataset.toLowerCase()}-${stamp}.${ext}`;
  return path.join(app.getPath('documents'), name);
};

export const exportRecords = async (payload: ExportRequest): Promise<ExportResult> => {
  const document = fetchData(payload.dataset, payload.period);
  const dialogOptions = {
    title: 'Export Records',
    defaultPath: getSuggestedPath(payload.dataset, payload.format),
    filters:
      payload.format === 'PDF'
        ? [{ name: 'PDF Document', extensions: ['pdf'] }]
        : [{ name: 'CSV File', extensions: ['csv'] }],
  };
  const focusedWindow = BrowserWindow.getFocusedWindow();

  const saveResult = focusedWindow
    ? await dialog.showSaveDialog(focusedWindow, dialogOptions)
    : await dialog.showSaveDialog(dialogOptions);

  if (saveResult.canceled || !saveResult.filePath) {
    throw new Error('Export cancelled.');
  }

  if (payload.format === 'CSV') {
    const csv = buildCsvContent(document);
    await writeFile(saveResult.filePath, csv, 'utf-8');
  } else {
    const html = buildPdfHtml(document);
    await saveBufferAsPdf(saveResult.filePath, html);
    const openError = await shell.openPath(saveResult.filePath);
    if (openError) {
      console.warn(`Failed to auto-open exported PDF: ${openError}`);
    }
  }

  const rowCount = document.sections.reduce((sum, section) => sum + section.rows.length, 0);

  return {
    filePath: saveResult.filePath,
    format: payload.format,
    rowCount,
  };
};

export const openExportFile = async (filePath: string): Promise<void> => {
  const openError = await shell.openPath(filePath);
  if (openError) {
    throw new Error(openError);
  }
};
