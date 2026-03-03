import styles from './PageSection.module.css';

export const MaintenancePage = () => {
  return (
    <div className={styles.pageGrid}>
      <article className={styles.panel}>
        <h2 className={styles.panelTitle}>Maintenance Logs</h2>
        <p className={styles.panelText}>Linked maintenance records and due-date support will be implemented in Phase 5.</p>
      </article>
    </div>
  );
};
