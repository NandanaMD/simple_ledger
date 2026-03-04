import { app, BrowserWindow, dialog } from 'electron';
import path from 'node:path';
import { copyFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import { closeDatabase, getDatabase, getDatabasePath, initializeDatabase, } from '../db/DatabaseClient.js';
const AUTO_BACKUP_MIN_SLOT = 6;
const AUTO_BACKUP_MAX_SLOT = 10;
const DESKTOP_BACKUP_FOLDER_NAME = 'Ledger Backup';
const getDesktopBackupDirectory = () => path.join(app.getPath('desktop'), DESKTOP_BACKUP_FOLDER_NAME);
const getAutoBackupDirectories = () => {
    const directories = [getDesktopBackupDirectory(), app.getPath('documents')];
    return [...new Set(directories)];
};
const getSlotPath = (directory, slot) => path.join(directory, `SL_backup_${slot}.db`);
const rotateBackupSlots = async (directory) => {
    await rm(getSlotPath(directory, AUTO_BACKUP_MIN_SLOT), { force: true });
    for (let slot = AUTO_BACKUP_MIN_SLOT + 1; slot <= AUTO_BACKUP_MAX_SLOT; slot += 1) {
        const currentPath = getSlotPath(directory, slot);
        const targetPath = getSlotPath(directory, slot - 1);
        try {
            await rename(currentPath, targetPath);
        }
        catch {
            continue;
        }
    }
};
const getDefaultBackupPath = () => {
    const now = new Date();
    const datePart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const timePart = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
    const filename = `simple-ledger-backup-${datePart}_${timePart}.db`;
    return path.join(getDesktopBackupDirectory(), filename);
};
export const backupDatabase = async () => {
    const parentWindow = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
    const defaultPath = getDefaultBackupPath();
    await mkdir(path.dirname(defaultPath), { recursive: true });
    const dialogResult = await dialog.showSaveDialog(parentWindow, {
        title: 'Backup Ledger Data',
        buttonLabel: 'Save Backup',
        defaultPath,
        filters: [{ name: 'Database Backup', extensions: ['db'] }],
    });
    if (dialogResult.canceled || !dialogResult.filePath) {
        throw new Error('Backup cancelled.');
    }
    const database = getDatabase();
    await database.backup(dialogResult.filePath);
    const fileInfo = await stat(dialogResult.filePath);
    return {
        filePath: dialogResult.filePath,
        sizeBytes: fileInfo.size,
        createdAt: new Date().toISOString(),
    };
};
export const restoreDatabase = async () => {
    const parentWindow = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
    const dialogResult = await dialog.showOpenDialog(parentWindow, {
        title: 'Restore Ledger Backup',
        buttonLabel: 'Restore Backup',
        properties: ['openFile'],
        filters: [{ name: 'Database Backup', extensions: ['db'] }],
    });
    if (dialogResult.canceled || dialogResult.filePaths.length === 0) {
        throw new Error('Restore cancelled.');
    }
    const sourcePath = dialogResult.filePaths[0];
    const targetPath = getDatabasePath();
    const targetWalPath = `${targetPath}-wal`;
    const targetShmPath = `${targetPath}-shm`;
    if (path.resolve(sourcePath) === path.resolve(targetPath)) {
        throw new Error('Selected backup is the active database file. Choose a different backup file.');
    }
    closeDatabase();
    try {
        await copyFile(sourcePath, targetPath);
        await rm(targetWalPath, { force: true });
        await rm(targetShmPath, { force: true });
        await initializeDatabase(app.getPath('userData'));
    }
    catch (error) {
        await initializeDatabase(app.getPath('userData'));
        throw new Error(`Restore failed: ${String(error)}`);
    }
    return {
        sourcePath,
        restoredAt: new Date().toISOString(),
    };
};
export const runAutoBackup = async () => {
    const database = getDatabase();
    const directories = getAutoBackupDirectories();
    for (const directory of directories) {
        await mkdir(directory, { recursive: true });
        await rotateBackupSlots(directory);
        await database.backup(getSlotPath(directory, AUTO_BACKUP_MAX_SLOT));
    }
};
