import { type TodoBackup } from './types.ts';
export declare const TODO_BACKUP_MAX_BYTES: number;
export declare function assertBackupSize(json: string): void;
export declare function parseTodoBackup(json: string): TodoBackup;
