export const schemaSql: string[] = [
  'PRAGMA foreign_keys = ON;',
  `CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    account_type TEXT NOT NULL,
    opening_balance REAL NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category_type TEXT NOT NULL CHECK (category_type IN ('INCOME', 'EXPENSE')),
    parent_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_unique
    ON categories(name, category_type, COALESCE(parent_id, -1));`,
  `CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('INCOME', 'EXPENSE', 'TRANSFER')),
    account_id INTEGER NOT NULL,
    to_account_id INTEGER,
    category_id INTEGER,
    amount REAL NOT NULL CHECK (amount > 0),
    transaction_date TEXT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts(id),
    FOREIGN KEY (to_account_id) REFERENCES accounts(id),
    FOREIGN KEY (category_id) REFERENCES categories(id)
  );`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_date
    ON transactions(transaction_date);`,
  `CREATE TABLE IF NOT EXISTS labourers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_labourers_name
    ON labourers(name);`,
  `CREATE TABLE IF NOT EXISTS labour_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    labourer_id INTEGER NOT NULL,
    entry_type TEXT NOT NULL CHECK (entry_type IN ('WAGE', 'ADVANCE', 'PAYMENT')),
    amount REAL NOT NULL CHECK (amount > 0),
    entry_date TEXT NOT NULL,
    note TEXT,
    payment_account_id INTEGER,
    linked_transaction_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (labourer_id) REFERENCES labourers(id) ON DELETE RESTRICT,
    FOREIGN KEY (payment_account_id) REFERENCES accounts(id),
    FOREIGN KEY (linked_transaction_id) REFERENCES transactions(id)
  );`,
  `CREATE INDEX IF NOT EXISTS idx_labour_entries_date
    ON labour_entries(entry_date);`,
  `CREATE INDEX IF NOT EXISTS idx_labour_entries_labourer
    ON labour_entries(labourer_id);`,
  `CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    asset_type TEXT,
    purchase_date TEXT,
    purchase_value REAL,
    warranty_expiry_date TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE TABLE IF NOT EXISTS maintenance_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    service_date TEXT NOT NULL,
    cost REAL,
    next_due_date TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
  );`,
];
