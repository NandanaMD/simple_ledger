import path from 'node:path';
import Database from 'better-sqlite3';
import { schemaSql } from './schema.js';
let db = null;
const runSchema = (database) => {
    const transaction = database.transaction(() => {
        schemaSql.forEach((statement) => {
            database.prepare(statement).run();
        });
        database
            .prepare(`INSERT INTO app_meta(key, value)
         VALUES ('schema_version', '1')
         ON CONFLICT(key) DO UPDATE SET value='1';`)
            .run();
    });
    transaction();
};
const runMigrations = (database) => {
    const columns = database
        .prepare("PRAGMA table_info('labour_entries');")
        .all();
    const names = new Set(columns.map((column) => column.name));
    if (!names.has('payment_account_id')) {
        database.prepare('ALTER TABLE labour_entries ADD COLUMN payment_account_id INTEGER;').run();
    }
    if (!names.has('linked_transaction_id')) {
        database.prepare('ALTER TABLE labour_entries ADD COLUMN linked_transaction_id INTEGER;').run();
    }
    database
        .prepare(`CREATE INDEX IF NOT EXISTS idx_labour_entries_payment_account
       ON labour_entries(payment_account_id);`)
        .run();
};
export const initializeDatabase = async (userDataPath) => {
    if (db) {
        return;
    }
    const dbPath = path.join(userDataPath, 'home-ledger.db');
    try {
        db = new Database(dbPath);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
        runSchema(db);
        runMigrations(db);
    }
    catch (error) {
        db = null;
        throw error;
    }
};
export const getDatabase = () => {
    if (!db) {
        throw new Error('Database not initialized.');
    }
    return db;
};
