/// <reference types="vite/client" />

import type { ElectronApi } from './shared/types/electron-api';

declare global {
  interface Window {
    api: ElectronApi;
  }
}

export {};
