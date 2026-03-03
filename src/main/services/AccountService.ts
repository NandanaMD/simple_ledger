import { getDatabase } from '../db/DatabaseClient.js';
import type { AccountInput, AccountType, AccountWithBalance } from '../../shared/types/ledger.js';

interface AccountRow {
  id: number;
  name: string;
  account_type: AccountType;
  opening_balance: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  current_balance: number;
}

const mapAccount = (row: AccountRow): AccountWithBalance => ({
  id: row.id,
  name: row.name,
  accountType: row.account_type,
  openingBalance: row.opening_balance,
  notes: row.notes,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  currentBalance: row.current_balance,
});

const validatePayload = (payload: AccountInput): void => {
  if (!payload.name.trim()) {
    throw new Error('Account name is required.');
  }
  if (!Number.isFinite(payload.openingBalance)) {
    throw new Error('Opening balance must be a valid number.');
  }
  if (!['BANK', 'CASH', 'WALLET'].includes(payload.accountType)) {
    throw new Error('Invalid account type.');
  }
};

export const listAccounts = async (): Promise<AccountWithBalance[]> => {
  const database = getDatabase();
  const rows = database
    .prepare(
      `SELECT
        a.id,
        a.name,
        a.account_type,
        a.opening_balance,
        a.notes,
        a.created_at,
        a.updated_at,
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
    .all() as AccountRow[];

  return rows.map(mapAccount);
};

const getAccountById = (id: number): AccountWithBalance => {
  const database = getDatabase();
  const row = database
    .prepare(
      `SELECT
        a.id,
        a.name,
        a.account_type,
        a.opening_balance,
        a.notes,
        a.created_at,
        a.updated_at,
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
      WHERE a.id = ?
      GROUP BY a.id;`,
    )
    .get(id) as AccountRow | undefined;

  if (!row) {
    throw new Error('Account not found.');
  }

  return mapAccount(row);
};

export const createAccount = async (payload: AccountInput): Promise<AccountWithBalance> => {
  validatePayload(payload);
  const database = getDatabase();

  const result = database
    .prepare(
      `INSERT INTO accounts(name, account_type, opening_balance, notes)
       VALUES (?, ?, ?, ?);`,
    )
    .run(
      payload.name.trim(),
      payload.accountType,
      payload.openingBalance,
      payload.notes?.trim() || null,
    );

  return getAccountById(Number(result.lastInsertRowid));
};

export const updateAccount = async (id: number, payload: AccountInput): Promise<AccountWithBalance> => {
  validatePayload(payload);
  const database = getDatabase();

  const result = database
    .prepare(
      `UPDATE accounts
       SET name = ?,
           account_type = ?,
           opening_balance = ?,
           notes = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?;`,
    )
    .run(
      payload.name.trim(),
      payload.accountType,
      payload.openingBalance,
      payload.notes?.trim() || null,
      id,
    );

  if (result.changes === 0) {
    throw new Error('Account not found.');
  }

  return getAccountById(id);
};

export const deleteAccount = async (id: number): Promise<void> => {
  const database = getDatabase();
  const usage = database
    .prepare(
      `SELECT COUNT(*) AS total
       FROM transactions
       WHERE account_id = ? OR to_account_id = ?;`,
    )
    .get(id, id) as { total: number };

  if (usage.total > 0) {
    throw new Error('Cannot delete account with existing transactions.');
  }

  const result = database.prepare('DELETE FROM accounts WHERE id = ?;').run(id);

  if (result.changes === 0) {
    throw new Error('Account not found.');
  }
};

export const getAccountRunningBalance = (accountId: number, excludeTransactionId?: number): number => {
  const database = getDatabase();

  const account = database
    .prepare('SELECT opening_balance AS openingBalance FROM accounts WHERE id = ?;')
    .get(accountId) as { openingBalance: number } | undefined;

  if (!account) {
    throw new Error('Account not found.');
  }

  const params: number[] = [accountId, accountId];
  let exclusionClause = '';
  if (excludeTransactionId !== undefined) {
    exclusionClause = ' AND t.id <> ?';
    params.push(excludeTransactionId);
  }

  const movement = database
    .prepare(
      `SELECT COALESCE(SUM(
        CASE
          WHEN t.transaction_type = 'INCOME' AND t.account_id = ? THEN t.amount
          WHEN t.transaction_type = 'EXPENSE' AND t.account_id = ? THEN -t.amount
          WHEN t.transaction_type = 'TRANSFER' AND t.account_id = ? THEN -t.amount
          WHEN t.transaction_type = 'TRANSFER' AND t.to_account_id = ? THEN t.amount
          ELSE 0
        END
      ), 0) AS net
      FROM transactions t
      WHERE (t.account_id = ? OR t.to_account_id = ?)` + exclusionClause,
    )
    .get(accountId, accountId, accountId, accountId, ...params) as { net: number };

  return account.openingBalance + movement.net;
};