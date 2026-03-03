export type UpdaterState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'up-to-date'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'unsupported'
  | 'error';

export interface UpdaterStatus {
  state: UpdaterState;
  message: string;
  version?: string;
  progressPercent?: number;
  bytesPerSecond?: number;
  transferredBytes?: number;
  totalBytes?: number;
}
