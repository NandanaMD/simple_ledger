import { app } from 'electron';
import electronUpdater from 'electron-updater';
const { autoUpdater } = electronUpdater;
let mainWindow = null;
let initialized = false;
let latestStatus = {
    state: 'idle',
    message: 'Updater is idle.',
};
const sendStatus = (status) => {
    latestStatus = status;
    if (!mainWindow || mainWindow.isDestroyed()) {
        return;
    }
    mainWindow.webContents.send('updater:status', status);
};
const toErrorMessage = (error) => {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
};
const registerUpdaterEvents = () => {
    autoUpdater.on('checking-for-update', () => {
        sendStatus({
            state: 'checking',
            message: 'Checking for updates...',
        });
    });
    autoUpdater.on('update-available', (info) => {
        sendStatus({
            state: 'available',
            version: info.version,
            message: `Update ${info.version} is available. Starting download...`,
        });
        void autoUpdater.downloadUpdate().catch((error) => {
            sendStatus({
                state: 'error',
                message: `Failed to download update: ${toErrorMessage(error)}`,
            });
        });
    });
    autoUpdater.on('update-not-available', (info) => {
        sendStatus({
            state: 'up-to-date',
            version: info.version,
            message: `You are on the latest version (${info.version}).`,
        });
    });
    autoUpdater.on('error', (error) => {
        sendStatus({
            state: 'error',
            message: `Update failed: ${toErrorMessage(error)}`,
        });
    });
    autoUpdater.on('download-progress', (progress) => {
        sendStatus({
            state: 'downloading',
            message: `Downloading update... ${progress.percent.toFixed(1)}%`,
            progressPercent: progress.percent,
            bytesPerSecond: progress.bytesPerSecond,
            transferredBytes: progress.transferred,
            totalBytes: progress.total,
        });
    });
    autoUpdater.on('update-downloaded', (info) => {
        sendStatus({
            state: 'downloaded',
            version: info.version,
            progressPercent: 100,
            message: `Update ${info.version} downloaded. Installing...`,
        });
        setTimeout(() => {
            sendStatus({
                state: 'installing',
                version: info.version,
                progressPercent: 100,
                message: 'Installing update and restarting app...',
            });
            autoUpdater.quitAndInstall(true, true);
        }, 1200);
    });
};
export const initializeUpdater = (window) => {
    mainWindow = window;
    if (initialized) {
        sendStatus(latestStatus);
        return;
    }
    initialized = true;
    if (!app.isPackaged) {
        sendStatus({
            state: 'unsupported',
            message: 'Auto update is available only in installed production builds.',
        });
        return;
    }
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    registerUpdaterEvents();
};
export const checkForAppUpdates = async () => {
    if (!app.isPackaged) {
        const status = {
            state: 'unsupported',
            message: 'Auto update is available only in installed production builds.',
        };
        sendStatus(status);
        return status;
    }
    await autoUpdater.checkForUpdates();
    return latestStatus;
};
export const downloadAppUpdate = async () => {
    if (!app.isPackaged) {
        const status = {
            state: 'unsupported',
            message: 'Auto update is available only in installed production builds.',
        };
        sendStatus(status);
        return status;
    }
    await autoUpdater.downloadUpdate();
    return latestStatus;
};
export const installDownloadedUpdate = () => {
    if (!app.isPackaged) {
        sendStatus({
            state: 'unsupported',
            message: 'Auto update is available only in installed production builds.',
        });
        return;
    }
    sendStatus({
        state: 'installing',
        progressPercent: 100,
        message: 'Installing update and restarting app...',
    });
    autoUpdater.quitAndInstall(true, true);
};
export const getUpdaterStatusSnapshot = () => latestStatus;
