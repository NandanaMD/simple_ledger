import { getDatabase } from '../db/DatabaseClient.js';
import type { Category, CategoryInput, CategoryType } from '../../shared/types/ledger.js';

interface CategoryRow {
  id: number;
  name: string;
  category_type: CategoryType;
  parent_id: number | null;
  parent_name: string | null;
  created_at: string;
  updated_at: string;
}

const mapCategory = (row: CategoryRow): Category => ({
  id: row.id,
  name: row.name,
  categoryType: row.category_type,
  parentId: row.parent_id,
  parentName: row.parent_name,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const validatePayload = (payload: CategoryInput): void => {
  if (!payload.name.trim()) {
    throw new Error('Category name is required.');
  }
  if (!['INCOME', 'EXPENSE'].includes(payload.categoryType)) {
    throw new Error('Invalid category type.');
  }
};

const getCategoryRow = (id: number): CategoryRow | undefined => {
  const database = getDatabase();
  return database
    .prepare(
      `SELECT
        c.id,
        c.name,
        c.category_type,
        c.parent_id,
        p.name AS parent_name,
        c.created_at,
        c.updated_at
      FROM categories c
      LEFT JOIN categories p ON p.id = c.parent_id
      WHERE c.id = ?;`,
    )
    .get(id) as CategoryRow | undefined;
};

const ensureNoCycle = (id: number, parentId: number): void => {
  const database = getDatabase();
  let currentParentId: number | null = parentId;

  while (currentParentId !== null) {
    if (currentParentId === id) {
      throw new Error('Category cannot be assigned as its own ancestor.');
    }

    const row = database
      .prepare('SELECT parent_id FROM categories WHERE id = ?;')
      .get(currentParentId) as { parent_id: number | null } | undefined;

    if (!row) {
      break;
    }

    currentParentId = row.parent_id;
  }
};

const validateParent = (parentId: number | undefined, categoryType: CategoryType, currentId?: number): void => {
  if (!parentId) {
    return;
  }

  if (currentId !== undefined && currentId === parentId) {
    throw new Error('Category cannot be its own parent.');
  }

  const row = getCategoryRow(parentId);
  if (!row) {
    throw new Error('Selected parent category does not exist.');
  }
  if (row.category_type !== categoryType) {
    throw new Error('Parent category type must match the selected category type.');
  }

  if (currentId !== undefined) {
    ensureNoCycle(currentId, parentId);
  }
};

const isUniqueConstraintError = (error: unknown): boolean =>
  error instanceof Error && /unique constraint/i.test(error.message);

const isForeignKeyConstraintError = (error: unknown): boolean =>
  error instanceof Error && /foreign key constraint failed/i.test(error.message);

const mapConstraintError = (error: unknown): Error => {
  if (isUniqueConstraintError(error)) {
    return new Error('A category with this name already exists in the same group.');
  }
  if (isForeignKeyConstraintError(error)) {
    return new Error('Cannot delete this category because it is used by existing transactions.');
  }
  return error instanceof Error ? error : new Error('Unexpected database error.');
};

const getCategoryById = (id: number): Category => {
  const row = getCategoryRow(id);
  if (!row) {
    throw new Error('Category not found.');
  }
  return mapCategory(row);
};

export const listCategories = async (): Promise<Category[]> => {
  const database = getDatabase();
  const rows = database
    .prepare(
      `SELECT
        c.id,
        c.name,
        c.category_type,
        c.parent_id,
        p.name AS parent_name,
        c.created_at,
        c.updated_at
      FROM categories c
      LEFT JOIN categories p ON p.id = c.parent_id
      ORDER BY c.category_type ASC, COALESCE(p.name, c.name) ASC, c.parent_id ASC, c.name ASC, c.id DESC;`,
    )
    .all() as CategoryRow[];

  return rows.map(mapCategory);
};

export const createCategory = async (payload: CategoryInput): Promise<Category> => {
  validatePayload(payload);
  validateParent(payload.parentId, payload.categoryType);

  const database = getDatabase();
  try {
    const result = database
      .prepare(
        `INSERT INTO categories(name, category_type, parent_id)
         VALUES (?, ?, ?);`,
      )
      .run(payload.name.trim(), payload.categoryType, payload.parentId ?? null);

    return getCategoryById(Number(result.lastInsertRowid));
  } catch (error) {
    throw mapConstraintError(error);
  }
};

export const updateCategory = async (id: number, payload: CategoryInput): Promise<Category> => {
  validatePayload(payload);
  validateParent(payload.parentId, payload.categoryType, id);

  const database = getDatabase();
  try {
    const result = database
      .prepare(
        `UPDATE categories
         SET name = ?,
             category_type = ?,
             parent_id = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?;`,
      )
      .run(payload.name.trim(), payload.categoryType, payload.parentId ?? null, id);

    if (result.changes === 0) {
      throw new Error('Category not found.');
    }

    return getCategoryById(id);
  } catch (error) {
    throw mapConstraintError(error);
  }
};

export const deleteCategory = async (id: number): Promise<void> => {
  const database = getDatabase();

  try {
    const result = database.prepare('DELETE FROM categories WHERE id = ?;').run(id);
    if (result.changes === 0) {
      throw new Error('Category not found.');
    }
  } catch (error) {
    throw mapConstraintError(error);
  }
};