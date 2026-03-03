import { useCallback, useEffect, useMemo, useState } from 'react';
import type { UpdaterStatus } from '../../shared/types/update';
import styles from './UpdatesPage.module.css';

const initialStatus: UpdaterStatus = {
  state: 'idle',
  message: 'Ready to check for updates.',
};

const bytesToReadable = (bytes?: number): string => {
  if (!bytes || bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
};

export const UpdatesPage = () => {
  const [status, setStatus] = useState<UpdaterStatus>(initialStatus);
  const [isChecking, setIsChecking] = useState(false);

  const refreshStatus = useCallback(async () => {
    try {
      const snapshot = await window.api.getUpdaterStatus();
      setStatus(snapshot);
    } catch (error) {
      setStatus({
        state: 'error',
        message: error instanceof Error ? error.message : 'Unable to fetch updater status.',
      });
    }
  }, []);

  const runCheck = useCallback(async () => {
    try {
      setIsChecking(true);
      await window.api.checkForUpdates();
    } catch (error) {
      setStatus({
        state: 'error',
        message: error instanceof Error ? error.message : 'Update check failed.',
      });
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const unsubscribe = window.api.onUpdaterStatus((nextStatus) => {
      if (!mounted) {
        return;
      }
      setStatus(nextStatus);
    });

    void refreshStatus().then(() => runCheck());

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [refreshStatus, runCheck]);

  const progressPercent = useMemo(() => {
    if (typeof status.progressPercent === 'number') {
      return Math.max(0, Math.min(100, status.progressPercent));
    }

    if (status.state === 'downloaded' || status.state === 'installing') {
      return 100;
    }

    return 0;
  }, [status.progressPercent, status.state]);

  const progressLabel = useMemo(() => {
    if (status.state !== 'downloading' && status.state !== 'downloaded' && status.state !== 'installing') {
      return null;
    }

    const transferred = bytesToReadable(status.transferredBytes);
    const total = bytesToReadable(status.totalBytes);
    const speed = bytesToReadable(status.bytesPerSecond);

    if (status.state === 'downloading') {
      return `${progressPercent.toFixed(1)}% • ${transferred} / ${total} • ${speed}/s`;
    }

    if (status.state === 'installing') {
      return '100% • Download complete • Installing';
    }

    return '100% • Download complete';
  }, [progressPercent, status.bytesPerSecond, status.state, status.totalBytes, status.transferredBytes]);

  return (
    <div className={styles.pageGrid}>
      <article className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2 className={styles.panelTitle}>Check for Updates</h2>
            <p className={styles.panelText}>This screen check the updates automatically and installs  once downloaded.</p>
          </div>
          <button
            type="button"
            className={styles.button}
            onClick={() => void runCheck()}
            disabled={isChecking || status.state === 'checking' || status.state === 'downloading' || status.state === 'installing'}
          >
            {isChecking || status.state === 'checking' ? 'Checking…' : 'Check Again'}
          </button>
        </div>

        <div className={styles.statusCard}>
          <p className={styles.statusBadge}>{status.state.replaceAll('-', ' ').toUpperCase()}</p>
          <p className={styles.statusMessage}>{status.message}</p>
          {status.version ? <p className={styles.statusVersion}>Version: {status.version}</p> : null}
        </div>

        <div className={styles.progressWrap}>
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
          </div>
          <p className={styles.progressText}>{progressLabel ?? 'Waiting for download...'}</p>
        </div>

        {status.state === 'downloaded' ? (
          <div className={styles.actionsRow}>
            <button type="button" className={styles.button} onClick={() => window.api.installUpdate()}>
              Install Now
            </button>
          </div>
        ) : null}

        {status.state === 'available' ? (
          <div className={styles.actionsRow}>
            <button type="button" className={styles.button} onClick={() => void window.api.downloadUpdate()}>
              Retry Download
            </button>
          </div>
        ) : null}
      </article>
    </div>
  );
};
