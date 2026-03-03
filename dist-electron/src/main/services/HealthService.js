import { app } from 'electron';
import { getDatabase } from '../db/DatabaseClient.js';
export const ping = async () => {
    try {
        const database = getDatabase();
        database.prepare('SELECT 1').get();
        return 'pong';
    }
    catch (error) {
        throw new Error(`Health check failed: ${String(error)}`);
    }
};
export const getAppVersion = async () => {
    try {
        return app.getVersion();
    }
    catch (error) {
        throw new Error(`Failed to get version: ${String(error)}`);
    }
};
