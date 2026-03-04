import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeDatabase } from '../src/main/db/DatabaseClient.js';
import { registerIpcHandlers } from '../src/main/ipc/registerIpcHandlers.js';
import { initializeUpdater } from '../src/main/services/UpdateService.js';
import { runAutoBackup } from '../src/main/services/BackupService.js';
let hasQuitBackupRun = false;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const createWindow = async () => {
    const mainWindow = new BrowserWindow({
        width: 1240,
        height: 820,
        minWidth: 980,
        minHeight: 640,
        show: false,
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
    });
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });
    const devServerUrl = process.env.VITE_DEV_SERVER_URL;
    if (devServerUrl) {
        await mainWindow.loadURL(devServerUrl);
    }
    else {
        await mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
    }
    initializeUpdater(mainWindow);
};
const bootstrap = async () => {
    await initializeDatabase(app.getPath('userData'));
    try {
        await runAutoBackup();
    }
    catch (error) {
        console.error('Auto backup at startup failed', error);
    }
    registerIpcHandlers();
    await createWindow();
};
app.whenReady().then(() => {
    bootstrap().catch((error) => {
        console.error('Failed to bootstrap application', error);
        app.quit();
    });
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            void createWindow();
        }
    });
});
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
app.on('before-quit', (event) => {
    if (hasQuitBackupRun) {
        return;
    }
    event.preventDefault();
    hasQuitBackupRun = true;
    void runAutoBackup()
        .catch((error) => {
        console.error('Auto backup on exit failed', error);
    })
        .finally(() => {
        app.exit(0);
    });
});
