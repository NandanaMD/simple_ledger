import { getDatabase } from '../db/DatabaseClient.js';
import { getAccountRunningBalance } from './AccountService.js';
import type { LedgerTransaction, TransactionInput, TransactionType } from '../../shared/types/ledger.js';

interface TransactionRow {
  id: number;
  transaction_type: TransactionType;
  account_id: number;
  account_name: string;
  to_account_id: number | null;
  to_account_name: string | null;
    category_id: number | null;
    category_name: string | null;
  amount: number;
  transaction_date: string;
  note: string | null;
  created_at: string;
  updated_at: string;
}

const mapTransaction = (row: TransactionRow): LedgerTransaction => ({
  id: row.id,
  transactionType: row.transaction_type,
  accountId: row.account_id,
  accountName: row.account_name,
  toAccountId: row.to_account_id,
  toAccountName: row.to_account_name,
    categoryId: row.category_id,
    categoryName: row.category_name,
  amount: row.amount,
  transactionDate: row.transaction_date,
  note: row.note,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const validateDate = (value: string): void => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Date must be in YYYY-MM-DD format.');
  }
};

const validatePayload = (payload: TransactionInput): void => {
  if (!['INCOME', 'EXPENSE', 'TRANSFER'].includes(payload.transactionType)) {
    throw new Error('Invalid transaction type.');
  }
  if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
    throw new Error('Amount must be greater than zero.');
  }
  validateDate(payload.transactionDate);
  if (payload.transactionType === 'TRANSFER') {
    if (!payload.toAccountId) {
      throw new Error('Destination account is required for transfer.');
    }
    if (payload.accountId === payload.toAccountId) {
      throw new Error('Transfer accounts must be different.');
    }
  }
};

const ensureAccountExists = (accountId: number): void => {
  const database = getDatabase();
  const account = database
    .prepare('SELECT id FROM accounts WHERE id = ?;')
    .get(accountId) as { id: number } | undefined;
  if (!account) {
    throw new Error('Selected account does not exist.');
  }
};

const ensureCategoryExistsAndMatchesType = (categoryId: number, transactionType: TransactionType): void => {
  if (transactionType === 'TRANSFER') {
    throw new Error('Transfers cannot have a category.');
  }

  const expectedType = transactionType === 'INCOME' ? 'INCOME' : 'EXPENSE';
  const database = getDatabase();
  const category = database
    .prepare('SELECT id, category_type FROM categories WHERE id = ?;')
    .get(categoryId) as { id: number; category_type: 'INCOME' | 'EXPENSE' } | undefined;

  if (!category) {
    throw new Error('Selected category does not exist.');
  }

  if (category.category_type !== expectedType) {
    throw new Error('Selected category type does not match the transaction type.');
  }
};

const getAccountType = (accountId: number): string => {
  const database = getDatabase();
  const account = database
    .prepare('SELECT account_type FROM accounts WHERE id = ?;')
    .get(accountId) as { account_type: string } | undefined;

  if (!account) {
    throw new Error('Selected account does not exist.');
  }

  return account.account_type;
};

const findTransactionById = (id: number): LedgerTransaction => {
  const database = getDatabase();
  const row = database
    .prepare(
      `SELECT
        t.id,
        t.transaction_type,
        t.account_id,
        a.name AS account_name,
        t.to_account_id,
        ta.name AS to_account_name,
        t.category_id,
        c.name AS category_name,
        t.amount,
        t.transaction_date,
        t.note,
        t.created_at,
        t.updated_at
      FROM transactions t
      INNER JOIN accounts a ON a.id = t.account_id
      LEFT JOIN accounts ta ON ta.id = t.to_account_id
      LEFT JOIN categories c ON c.id = t.category_id
      WHERE t.id = ?;`,
    )
    .get(id) as TransactionRow | undefined;

  if (!row) {
    throw new Error('Transaction not found.');
  }

  return mapTransaction(row);
};

const validateBalanceForCreate = (payload: TransactionInput): void => {
  if (payload.transactionType === 'INCOME') {
    return;
  }

  const fromBalance = getAccountRunningBalance(payload.accountId);
  const accountType = getAccountType(payload.accountId);

  if (accountType === 'BANK' && fromBalance <= 0) {
    throw new Error('This bank has no available balance, so spending is blocked.');
  }

  if (fromBalance - payload.amount < 0) {
    throw new Error('Insufficient balance in source account.');
  }
};

const validateBalanceForUpdate = (id: number, payload: TransactionInput): void => {
  if (payload.transactionType === 'INCOME') {
    return;
  }

  const fromBalance = getAccountRunningBalance(payload.accountId, id);
  const accountType = getAccountType(payload.accountId);

  if (accountType === 'BANK' && fromBalance <= 0) {
    throw new Error('This bank has no available balance, so spending is blocked.');
  }

  if (fromBalance - payload.amount < 0) {
    throw new Error('Insufficient balance in source account.');
  }
};

export const listTransactions = async (): Promise<LedgerTransaction[]> => {
  const database = getDatabase();
  const rows = database
    .prepare(
      `SELECT
        t.id,
        t.transaction_type,
        t.account_id,
        a.name AS account_name,
        t.to_account_id,
        ta.name AS to_account_name,
        t.category_id,
        c.name AS category_name,
        t.amount,
        t.transaction_date,
        t.note,
        t.created_at,
        t.updated_at
      FROM transactions t
      INNER JOIN accounts a ON a.id = t.account_id
      LEFT JOIN accounts ta ON ta.id = t.to_account_id
      LEFT JOIN categories c ON c.id = t.category_id
      ORDER BY t.transaction_date DESC, t.id DESC;`,
    )
    .all() as TransactionRow[];

  return rows.map(mapTransaction);
};

export const createTransaction = async (payload: TransactionInput): Promise<LedgerTransaction> => {
  validatePayload(payload);
  ensureAccountExists(payload.accountId);
  if (payload.toAccountId) {
    ensureAccountExists(payload.toAccountId);
  }
  if (payload.categoryId) {
    ensureCategoryExistsAndMatchesType(payload.categoryId, payload.transactionType);
  }
  validateBalanceForCreate(payload);

  const database = getDatabase();
  const result = database
    .prepare(
      `INSERT INTO transactions(
        transaction_type,
        account_id,
        to_account_id,
        category_id,
        amount,
        transaction_date,
        note
      ) VALUES (?, ?, ?, ?, ?, ?, ?);`,
    )
    .run(
      payload.transactionType,
      payload.accountId,
      payload.transactionType === 'TRANSFER' ? payload.toAccountId ?? null : null,
      payload.transactionType === 'TRANSFER' ? null : payload.categoryId ?? null,
      payload.amount,
      payload.transactionDate,
      payload.note?.trim() || null,
    );

  return findTransactionById(Number(result.lastInsertRowid));
};

export const updateTransaction = async (id: number, payload: TransactionInput): Promise<LedgerTransaction> => {
  validatePayload(payload);
  ensureAccountExists(payload.accountId);
  if (payload.toAccountId) {
    ensureAccountExists(payload.toAccountId);
  }
  if (payload.categoryId) {
    ensureCategoryExistsAndMatchesType(payload.categoryId, payload.transactionType);
  }
  validateBalanceForUpdate(id, payload);

  const database = getDatabase();
  const result = database
    .prepare(
      `UPDATE transactions
       SET transaction_type = ?,
           account_id = ?,
           to_account_id = ?,
          category_id = ?,
           amount = ?,
           transaction_date = ?,
           note = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?;`,
    )
    .run(
      payload.transactionType,
      payload.accountId,
      payload.transactionType === 'TRANSFER' ? payload.toAccountId ?? null : null,
      payload.transactionType === 'TRANSFER' ? null : payload.categoryId ?? null,
      payload.amount,
      payload.transactionDate,
      payload.note?.trim() || null,
      id,
    );

  if (result.changes === 0) {
    throw new Error('Transaction not found.');
  }

  return findTransactionById(id);
};

export const deleteTransaction = async (id: number): Promise<void> => {
  const database = getDatabase();
  const result = database.prepare('DELETE FROM transactions WHERE id = ?;').run(id);
  if (result.changes === 0) {
    throw new Error('Transaction not found.');
  }
};