import { DataSource } from 'typeorm';
export declare class SyncService {
    private readonly localDataSource;
    private readonly logger;
    private isSyncing;
    private cloudDataSource;
    constructor(localDataSource: DataSource);
    private getCloudConnection;
    handleCron(): Promise<void>;
}
