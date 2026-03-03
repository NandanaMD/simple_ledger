import { getDatabase } from '../db/DatabaseClient.js';
import { getAccountRunningBalance } from './AccountService.js';
const mapLabourerSummary = (row) => ({
    id: row.id,
    name: row.name,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    totalEarned: row.total_earned,
    totalPaid: row.total_paid,
    pending: row.total_earned - row.total_paid,
});
const mapLabourEntry = (row) => ({
    id: row.id,
    labourerId: row.labourer_id,
    labourerName: row.labourer_name,
    entryType: row.entry_type,
    amount: row.amount,
    entryDate: row.entry_date,
    note: row.note,
    paymentAccountId: row.payment_account_id,
    paymentAccountName: row.payment_account_name,
    linkedTransactionId: row.linked_transaction_id,
    createdAt: row.created_at,
});
const mapPeriodSummary = (row) => ({
    periodKey: row.period_key,
    totalEarned: row.total_earned,
    totalPaid: row.total_paid,
    pending: row.total_earned - row.total_paid,
});
const validateDate = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new Error('Date must be in YYYY-MM-DD format.');
    }
};
const validateLabourerInput = (payload) => {
    if (!payload.name.trim()) {
        throw new Error('Labourer name is required.');
    }
};
const validateEntryInput = (payload) => {
    if (!['WAGE', 'ADVANCE', 'PAYMENT'].includes(payload.entryType)) {
        throw new Error('Invalid entry type.');
    }
    if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
        throw new Error('Amount must be greater than zero.');
    }
    validateDate(payload.entryDate);
    if (payload.entryType === 'WAGE' && payload.paymentAccountId) {
        throw new Error('Bank account can only be selected for advance or payment entries.');
    }
};
const normalizePaymentAccountId = (value) => {
    if (!value || value <= 0) {
        return null;
    }
    return value;
};
const ensureLabourerExists = (labourerId) => {
    const database = getDatabase();
    const row = database
        .prepare('SELECT id FROM labourers WHERE id = ?;')
        .get(labourerId);
    if (!row) {
        throw new Error('Labourer not found.');
    }
};
const ensureBankAccountForPayout = (accountId, amount, existingTransactionId) => {
    const database = getDatabase();
    const account = database
        .prepare('SELECT account_type FROM accounts WHERE id = ?;')
        .get(accountId);
    if (!account) {
        throw new Error('Selected bank account does not exist.');
    }
    if (account.account_type !== 'BANK') {
        throw new Error('Only BANK accounts can be selected for labour payouts.');
    }
    const balance = getAccountRunningBalance(accountId, existingTransactionId);
    if (balance <= 0) {
        throw new Error('This bank has no available balance, so labour payout is blocked.');
    }
    if (balance - amount < 0) {
        throw new Error('Insufficient bank balance for this labour payout.');
    }
};
const getLabourerSummaryById = (id) => {
    const database = getDatabase();
    const row = database
        .prepare(`SELECT
        l.id,
        l.name,
        l.notes,
        l.created_at,
        l.updated_at,
        COALESCE(SUM(CASE WHEN e.entry_type = 'WAGE' THEN e.amount ELSE 0 END), 0) AS total_earned,
        COALESCE(SUM(CASE WHEN e.entry_type IN ('ADVANCE', 'PAYMENT') THEN e.amount ELSE 0 END), 0) AS total_paid
      FROM labourers l
      LEFT JOIN labour_entries e ON e.labourer_id = l.id
      WHERE l.id = ?
      GROUP BY l.id;`)
        .get(id);
    if (!row) {
        throw new Error('Labourer not found.');
    }
    return mapLabourerSummary(row);
};
const getLabourEntryById = (id) => {
    const database = getDatabase();
    const row = database
        .prepare(`SELECT
        e.id,
        e.labourer_id,
        l.name AS labourer_name,
        e.entry_type,
        e.amount,
        e.entry_date,
        e.note,
        e.payment_account_id,
        pa.name AS payment_account_name,
        e.linked_transaction_id,
        e.created_at
      FROM labour_entries e
      INNER JOIN labourers l ON l.id = e.labourer_id
      LEFT JOIN accounts pa ON pa.id = e.payment_account_id
      WHERE e.id = ?;`)
        .get(id);
    if (!row) {
        throw new Error('Labour entry not found.');
    }
    return mapLabourEntry(row);
};
const syncLinkedExpenseTransaction = (existingTransactionId, paymentAccountId, entryType, amount, entryDate, labourerName, note) => {
    const database = getDatabase();
    const shouldDeduct = entryType !== 'WAGE' && paymentAccountId !== null;
    if (!shouldDeduct) {
        if (existingTransactionId) {
            database.prepare('DELETE FROM transactions WHERE id = ?;').run(existingTransactionId);
        }
        return null;
    }
    ensureBankAccountForPayout(paymentAccountId, amount, existingTransactionId ?? undefined);
    const transactionNote = note?.trim()
        ? `Labour ${entryType}: ${labourerName} - ${note.trim()}`
        : `Labour ${entryType}: ${labourerName}`;
    if (existingTransactionId) {
        const updateResult = database
            .prepare(`UPDATE transactions
         SET transaction_type = 'EXPENSE',
             account_id = ?,
             to_account_id = NULL,
             amount = ?,
             transaction_date = ?,
             note = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?;`)
            .run(paymentAccountId, amount, entryDate, transactionNote, existingTransactionId);
        if (updateResult.changes === 0) {
            throw new Error('Linked payout transaction not found.');
        }
        return existingTransactionId;
    }
    const createResult = database
        .prepare(`INSERT INTO transactions(
        transaction_type,
        account_id,
        to_account_id,
        amount,
        transaction_date,
        note
      ) VALUES ('EXPENSE', ?, NULL, ?, ?, ?);`)
        .run(paymentAccountId, amount, entryDate, transactionNote);
    return Number(createResult.lastInsertRowid);
};
export const listLabourers = async () => {
    const database = getDatabase();
    const rows = database
        .prepare(`SELECT
        l.id,
        l.name,
        l.notes,
        l.created_at,
        l.updated_at,
        COALESCE(SUM(CASE WHEN e.entry_type = 'WAGE' THEN e.amount ELSE 0 END), 0) AS total_earned,
        COALESCE(SUM(CASE WHEN e.entry_type IN ('ADVANCE', 'PAYMENT') THEN e.amount ELSE 0 END), 0) AS total_paid
      FROM labourers l
      LEFT JOIN labour_entries e ON e.labourer_id = l.id
      GROUP BY l.id
      ORDER BY l.created_at DESC, l.id DESC;`)
        .all();
    return rows.map(mapLabourerSummary);
};
export const createLabourer = async (payload) => {
    validateLabourerInput(payload);
    const database = getDatabase();
    const result = database
        .prepare('INSERT INTO labourers(name, notes) VALUES (?, ?);')
        .run(payload.name.trim(), payload.notes?.trim() || null);
    return getLabourerSummaryById(Number(result.lastInsertRowid));
};
export const updateLabourer = async (id, payload) => {
    validateLabourerInput(payload);
    const database = getDatabase();
    const result = database
        .prepare(`UPDATE labourers
       SET name = ?,
           notes = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?;`)
        .run(payload.name.trim(), payload.notes?.trim() || null, id);
    if (result.changes === 0) {
        throw new Error('Labourer not found.');
    }
    return getLabourerSummaryById(id);
};
export const deleteLabourer = async (id) => {
    const database = getDatabase();
    const usage = database
        .prepare('SELECT COUNT(*) AS total FROM labour_entries WHERE labourer_id = ?;')
        .get(id);
    if (usage.total > 0) {
        throw new Error('Cannot delete labourer with existing entries.');
    }
    const result = database.prepare('DELETE FROM labourers WHERE id = ?;').run(id);
    if (result.changes === 0) {
        throw new Error('Labourer not found.');
    }
};
export const listLabourEntries = async (labourerId) => {
    const database = getDatabase();
    if (labourerId !== undefined) {
        ensureLabourerExists(labourerId);
    }
    const rows = labourerId
        ? database
            .prepare(`SELECT
            e.id,
            e.labourer_id,
            l.name AS labourer_name,
            e.entry_type,
            e.amount,
            e.entry_date,
            e.note,
            e.payment_account_id,
            pa.name AS payment_account_name,
            e.linked_transaction_id,
            e.created_at
          FROM labour_entries e
          INNER JOIN labourers l ON l.id = e.labourer_id
          LEFT JOIN accounts pa ON pa.id = e.payment_account_id
          WHERE e.labourer_id = ?
          ORDER BY e.entry_date DESC, e.id DESC;`)
            .all(labourerId)
        : database
            .prepare(`SELECT
            e.id,
            e.labourer_id,
            l.name AS labourer_name,
            e.entry_type,
            e.amount,
            e.entry_date,
            e.note,
            e.payment_account_id,
            pa.name AS payment_account_name,
            e.linked_transaction_id,
            e.created_at
          FROM labour_entries e
          INNER JOIN labourers l ON l.id = e.labourer_id
          LEFT JOIN accounts pa ON pa.id = e.payment_account_id
          ORDER BY e.entry_date DESC, e.id DESC;`)
            .all();
    return rows.map(mapLabourEntry);
};
export const createLabourEntry = async (payload) => {
    validateEntryInput(payload);
    ensureLabourerExists(payload.labourerId);
    const paymentAccountId = normalizePaymentAccountId(payload.paymentAccountId);
    const database = getDatabase();
    const labourer = database
        .prepare('SELECT name FROM labourers WHERE id = ?;')
        .get(payload.labourerId);
    const linkedTransactionId = syncLinkedExpenseTransaction(null, paymentAccountId, payload.entryType, payload.amount, payload.entryDate, labourer.name, payload.note);
    const result = database
        .prepare(`INSERT INTO labour_entries(
        labourer_id,
        entry_type,
        amount,
        entry_date,
        note,
        payment_account_id,
        linked_transaction_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?);`)
        .run(payload.labourerId, payload.entryType, payload.amount, payload.entryDate, payload.note?.trim() || null, paymentAccountId, linkedTransactionId);
    return getLabourEntryById(Number(result.lastInsertRowid));
};
export const updateLabourEntry = async (id, payload) => {
    validateEntryInput(payload);
    ensureLabourerExists(payload.labourerId);
    const database = getDatabase();
    const existing = database
        .prepare(`SELECT id, linked_transaction_id
       FROM labour_entries
       WHERE id = ?;`)
        .get(id);
    if (!existing) {
        throw new Error('Labour entry not found.');
    }
    const labourer = database
        .prepare('SELECT name FROM labourers WHERE id = ?;')
        .get(payload.labourerId);
    const paymentAccountId = normalizePaymentAccountId(payload.paymentAccountId);
    const linkedTransactionId = syncLinkedExpenseTransaction(existing.linked_transaction_id, paymentAccountId, payload.entryType, payload.amount, payload.entryDate, labourer.name, payload.note);
    const result = database
        .prepare(`UPDATE labour_entries
       SET labourer_id = ?,
           entry_type = ?,
           amount = ?,
           entry_date = ?,
           note = ?,
           payment_account_id = ?,
           linked_transaction_id = ?
       WHERE id = ?;`)
        .run(payload.labourerId, payload.entryType, payload.amount, payload.entryDate, payload.note?.trim() || null, paymentAccountId, linkedTransactionId, id);
    if (result.changes === 0) {
        throw new Error('Labour entry not found.');
    }
    return getLabourEntryById(id);
};
export const deleteLabourEntry = async (id) => {
    const database = getDatabase();
    const existing = database
        .prepare(`SELECT linked_transaction_id
       FROM labour_entries
       WHERE id = ?;`)
        .get(id);
    if (!existing) {
        throw new Error('Labour entry not found.');
    }
    if (existing.linked_transaction_id) {
        database.prepare('DELETE FROM transactions WHERE id = ?;').run(existing.linked_transaction_id);
    }
    const result = database.prepare('DELETE FROM labour_entries WHERE id = ?;').run(id);
    if (result.changes === 0) {
        throw new Error('Labour entry not found.');
    }
};
const getPeriodSummary = (periodExpression, labourerId) => {
    const database = getDatabase();
    const baseSql = `SELECT
      ${periodExpression} AS period_key,
      COALESCE(SUM(CASE WHEN entry_type = 'WAGE' THEN amount ELSE 0 END), 0) AS total_earned,
      COALESCE(SUM(CASE WHEN entry_type IN ('ADVANCE', 'PAYMENT') THEN amount ELSE 0 END), 0) AS total_paid
    FROM labour_entries`;
    const sql = labourerId
        ? `${baseSql} WHERE labourer_id = ? GROUP BY period_key ORDER BY period_key DESC LIMIT 12;`
        : `${baseSql} GROUP BY period_key ORDER BY period_key DESC LIMIT 12;`;
    const rows = labourerId
        ? database.prepare(sql).all(labourerId)
        : database.prepare(sql).all();
    return rows.map(mapPeriodSummary);
};
export const getLabourSummaries = async (labourerId) => {
    if (labourerId !== undefined) {
        ensureLabourerExists(labourerId);
    }
    return {
        weekly: getPeriodSummary("strftime('%Y-W%W', entry_date)", labourerId),
        monthly: getPeriodSummary("strftime('%Y-%m', entry_date)", labourerId),
    };
};
