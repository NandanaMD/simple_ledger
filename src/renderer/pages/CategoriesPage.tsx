import { type FormEvent, useEffect, useMemo, useState } from 'react';
import type { Category, CategoryType } from '../../shared/types/ledger';
import styles from './LedgerPage.module.css';

const defaultCategoryType: CategoryType = 'EXPENSE';

const toFriendlyErrorMessage = (error: unknown, fallback: string) => {
  if (!(error instanceof Error)) {
    return fallback;
  }

  const normalizedMessage = error.message
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .trim();

  const lowerMessage = normalizedMessage.toLowerCase();
  if (lowerMessage.includes('already exists')) {
    return 'This name is already used in the same category group.';
  }
  if (lowerMessage.includes('cannot delete this category')) {
    return 'This category is linked to transactions and cannot be deleted.';
  }
  if (lowerMessage.includes('category name is required')) {
    return 'Please enter a category name.';
  }

  return normalizedMessage || fallback;
};

const getCategoryApi = () => {
  if (
    typeof window.api.listCategories !== 'function' ||
    typeof window.api.createCategory !== 'function' ||
    typeof window.api.updateCategory !== 'function' ||
    typeof window.api.deleteCategory !== 'function'
  ) {
    throw new Error('Categories module is updating. Please restart the app once.');
  }

  return {
    listCategories: window.api.listCategories,
    createCategory: window.api.createCategory,
    updateCategory: window.api.updateCategory,
    deleteCategory: window.api.deleteCategory,
  };
};

export const CategoriesPage = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryName, setCategoryName] = useState('');
  const [categoryType, setCategoryType] = useState<CategoryType>(defaultCategoryType);
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [subcategoryName, setSubcategoryName] = useState('');
  const [activeParentCategoryId, setActiveParentCategoryId] = useState<number | null>(null);
  const [editingSubcategoryId, setEditingSubcategoryId] = useState<number | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showSubcategoryModal, setShowSubcategoryModal] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(''), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const loadCategories = async () => {
    try {
      const categoryApi = getCategoryApi();
      const data = await categoryApi.listCategories();
      setCategories(data);
    } catch (loadError) {
      setToast(toFriendlyErrorMessage(loadError, 'Unable to load categories.'));
    }
  };

  useEffect(() => {
    void loadCategories();
  }, []);

  const mainCategories = useMemo(
    () =>
      categories
        .filter((category) => category.parentId === null)
        .sort((left, right) => {
          if (left.categoryType !== right.categoryType) {
            return left.categoryType.localeCompare(right.categoryType);
          }
          return left.name.localeCompare(right.name);
        }),
    [categories],
  );

  const subcategoriesByParent = useMemo(() => {
    const map = new Map<number, Category[]>();
    categories
      .filter((category) => category.parentId !== null)
      .forEach((subcategory) => {
        const parentId = subcategory.parentId as number;
        const current = map.get(parentId) ?? [];
        current.push(subcategory);
        map.set(parentId, current);
      });

    map.forEach((items) => {
      items.sort((left, right) => left.name.localeCompare(right.name));
    });

    return map;
  }, [categories]);

  const summaries = useMemo(() => {
    return categories.reduce(
      (accumulator, category) => {
        accumulator.total += 1;
        if (category.categoryType === 'INCOME') {
          accumulator.income += 1;
        } else {
          accumulator.expense += 1;
        }
        if (category.parentId === null) {
          accumulator.parent += 1;
        } else {
          accumulator.sub += 1;
        }
        return accumulator;
      },
      { total: 0, income: 0, expense: 0, parent: 0, sub: 0 },
    );
  }, [categories]);

  const activeParentCategory = useMemo(
    () => mainCategories.find((category) => category.id === activeParentCategoryId) ?? null,
    [activeParentCategoryId, mainCategories],
  );

  const openCategoryModal = () => {
    setEditingCategoryId(null);
    setCategoryName('');
    setCategoryType(defaultCategoryType);
    setShowCategoryModal(true);
  };

  const openEditCategoryModal = (category: Category) => {
    setEditingCategoryId(category.id);
    setCategoryName(category.name);
    setCategoryType(category.categoryType);
    setShowCategoryModal(true);
  };

  const openSubcategoryModal = (parentCategory: Category) => {
    setEditingSubcategoryId(null);
    setActiveParentCategoryId(parentCategory.id);
    setSubcategoryName('');
    setShowSubcategoryModal(true);
  };

  const openEditSubcategoryModal = (subcategory: Category) => {
    if (subcategory.parentId === null) {
      return;
    }

    setEditingSubcategoryId(subcategory.id);
    setActiveParentCategoryId(subcategory.parentId);
    setSubcategoryName(subcategory.name);
    setShowSubcategoryModal(true);
  };

  const closeCategoryModal = () => {
    setShowCategoryModal(false);
    setEditingCategoryId(null);
  };

  const closeSubcategoryModal = () => {
    setShowSubcategoryModal(false);
    setEditingSubcategoryId(null);
    setActiveParentCategoryId(null);
  };

  useEffect(() => {
    if (!showCategoryModal && !showSubcategoryModal) {
      return;
    }

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      if (showSubcategoryModal) {
        closeSubcategoryModal();
        return;
      }
      if (showCategoryModal) {
        closeCategoryModal();
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [showCategoryModal, showSubcategoryModal]);

  const createMainCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      if (!categoryName.trim()) {
        throw new Error('Category name is required.');
      }

      const categoryApi = getCategoryApi();
      if (editingCategoryId === null) {
        await categoryApi.createCategory({
          name: categoryName.trim(),
          categoryType,
        });
      } else {
        await categoryApi.updateCategory(editingCategoryId, {
          name: categoryName.trim(),
          categoryType,
        });
      }

      setShowCategoryModal(false);
      setEditingCategoryId(null);
      setCategoryName('');
      await loadCategories();
    } catch (submitError) {
      setToast(toFriendlyErrorMessage(submitError, 'Unable to save category.'));
    }
  };

  const createSubcategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      if (!activeParentCategory) {
        throw new Error('Please choose a main category.');
      }
      if (!subcategoryName.trim()) {
        throw new Error('Please enter a subcategory name.');
      }

      const categoryApi = getCategoryApi();
      if (editingSubcategoryId === null) {
        await categoryApi.createCategory({
          name: subcategoryName.trim(),
          categoryType: activeParentCategory.categoryType,
          parentId: activeParentCategory.id,
        });
      } else {
        await categoryApi.updateCategory(editingSubcategoryId, {
          name: subcategoryName.trim(),
          categoryType: activeParentCategory.categoryType,
          parentId: activeParentCategory.id,
        });
      }

      setShowSubcategoryModal(false);
      setEditingSubcategoryId(null);
      setSubcategoryName('');
      setActiveParentCategoryId(null);
      await loadCategories();
    } catch (submitError) {
      setToast(toFriendlyErrorMessage(submitError, 'Unable to save subcategory.'));
    }
  };

  const removeCategory = async (category: Category) => {
    try {
      if (category.parentId === null) {
        const children = subcategoriesByParent.get(category.id) ?? [];
        if (children.length > 0) {
          throw new Error('Delete subcategories first, then delete this main category.');
        }
      }

      const categoryApi = getCategoryApi();
      await categoryApi.deleteCategory(category.id);
      await loadCategories();
    } catch (deleteError) {
      setToast(toFriendlyErrorMessage(deleteError, 'Unable to delete category.'));
    }
  };

  const categoryTypeLabel = (type: CategoryType) => (type === 'INCOME' ? 'Income' : 'Expense');

  const categoryBadgeClass = (type: CategoryType) =>
    type === 'INCOME' ? `${styles.badge} ${styles.badgeIncome}` : `${styles.badge} ${styles.badgeExpense}`;

  return (
    <div className={styles.sectionGrid}>
      <article className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2 className={styles.panelTitle}>Category Highlights</h2>
          <p className={styles.panelText}>Simple setup with main categories and subcategories.</p>
        </div>
        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Total</p>
            <p className={styles.summaryValue}>{summaries.total}</p>
          </div>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Income</p>
            <p className={`${styles.summaryValue} ${styles.amountPositive}`}>{summaries.income}</p>
          </div>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Expense</p>
            <p className={`${styles.summaryValue} ${styles.amountNegative}`}>{summaries.expense}</p>
          </div>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Main / Sub</p>
            <p className={styles.summaryValue}>{`${summaries.parent} / ${summaries.sub}`}</p>
          </div>
        </div>
      </article>

      <article className={styles.panel}>
        <div className={styles.iconToolbar}>
          <div>
            <h3 className={styles.panelTitle}>Category & Subcategory</h3>
            <p className={styles.valueHint}>Create main category first. Add subcategory from that category card.</p>
          </div>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonPrimary} ${styles.buttonPrimaryEmphasis}`}
            onClick={openCategoryModal}
          >
            + Add Category
          </button>
        </div>

        <div className={styles.categoryCardGrid}>
          {mainCategories.map((category) => {
            const children = subcategoriesByParent.get(category.id) ?? [];

            return (
              <div key={category.id} className={styles.categoryCard}>
                <div className={styles.categoryCardHeader}>
                  <div className={styles.categoryCardTitleWrap}>
                    <h4 className={styles.categoryCardTitle}>{category.name}</h4>
                    <span className={categoryBadgeClass(category.categoryType)}>{categoryTypeLabel(category.categoryType)}</span>
                  </div>
                  <div className={styles.categoryActions}>
                    <button className={styles.button} type="button" onClick={() => openSubcategoryModal(category)}>
                      + Add Subcategory
                    </button>
                    <button className={`${styles.button} ${styles.buttonCompact}`} type="button" onClick={() => openEditCategoryModal(category)}>
                      Edit
                    </button>
                    <button
                      className={`${styles.button} ${styles.buttonDanger} ${styles.buttonCompact}`}
                      type="button"
                      onClick={() => removeCategory(category)}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div className={styles.subcategoryList}>
                  {children.length === 0 ? (
                    <p className={styles.emptyText}>No subcategory yet.</p>
                  ) : (
                    children.map((subcategory) => (
                      <div key={subcategory.id} className={styles.subcategoryRow}>
                        <span className={styles.subcategoryName}>{subcategory.name}</span>
                        <div className={styles.categoryRowActions}>
                          <button className={`${styles.button} ${styles.buttonCompact}`} type="button" onClick={() => openEditSubcategoryModal(subcategory)}>
                            Edit
                          </button>
                          <button
                            className={`${styles.button} ${styles.buttonDanger} ${styles.buttonCompact}`}
                            type="button"
                            onClick={() => removeCategory(subcategory)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {!mainCategories.length ? <p className={styles.emptyText}>No categories found. Use “+ Add Category” to start.</p> : null}
      </article>

      {showCategoryModal ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Add category">
          <div className={styles.modalCardSmall}>
            <div className={styles.modalHeader}>
              <h3 className={styles.panelTitle}>{editingCategoryId === null ? 'Add Category' : 'Edit Category'}</h3>
              <button
                className={styles.button}
                type="button"
                onClick={closeCategoryModal}
              >
                Close
              </button>
            </div>
            <form className={styles.modalFormStack} onSubmit={createMainCategory}>
              <div className={styles.formField}>
                <label className={styles.fieldLabel}>Name</label>
                <input
                  className={styles.input}
                  placeholder="e.g. Groceries"
                  value={categoryName}
                  onChange={(event) => setCategoryName(event.target.value)}
                />
              </div>
              <div className={styles.formField}>
                <label className={styles.fieldLabel}>Type</label>
                <select
                  className={styles.select}
                  value={categoryType}
                  onChange={(event) => setCategoryType(event.target.value as CategoryType)}
                >
                  <option value="INCOME">Income</option>
                  <option value="EXPENSE">Expense</option>
                </select>
              </div>
              <div className={styles.modalActionsRow}>
                <button className={`${styles.button} ${styles.buttonPrimary}`} type="submit">
                  {editingCategoryId === null ? 'Create Category' : 'Save Changes'}
                </button>
                <button
                  className={styles.button}
                  type="button"
                  onClick={closeCategoryModal}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {showSubcategoryModal ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Add subcategory">
          <div className={styles.modalCardSmall}>
            <div className={styles.modalHeader}>
              <h3 className={styles.panelTitle}>{editingSubcategoryId === null ? 'Add Subcategory' : 'Edit Subcategory'}</h3>
              <button
                className={styles.button}
                type="button"
                onClick={closeSubcategoryModal}
              >
                Close
              </button>
            </div>
            <form className={styles.modalFormStack} onSubmit={createSubcategory}>
              <div className={styles.formField}>
                <label className={styles.fieldLabel}>Main Category</label>
                <input className={styles.input} value={activeParentCategory?.name ?? ''} readOnly disabled />
              </div>
              <div className={styles.formField}>
                <label className={styles.fieldLabel}>Subcategory Name</label>
                <input
                  className={styles.input}
                  placeholder="e.g. Vegetables"
                  value={subcategoryName}
                  onChange={(event) => setSubcategoryName(event.target.value)}
                />
              </div>
              <div className={styles.modalActionsRow}>
                <button className={`${styles.button} ${styles.buttonPrimary}`} type="submit">
                  {editingSubcategoryId === null ? 'Create Subcategory' : 'Save Changes'}
                </button>
                <button
                  className={styles.button}
                  type="button"
                  onClick={closeSubcategoryModal}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {toast ? <div className={styles.toast}>{toast}</div> : null}
    </div>
  );
};
