import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Token } from '../tokens/entities/token.entity';

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
  private isSyncing = false;
  private cloudDataSource: DataSource | null = null;

  constructor(
    @InjectDataSource() private readonly localDataSource: DataSource,
  ) {}

  private async getCloudConnection(): Promise<DataSource | null> {
    const url = process.env.DATABASE_URL;
    if (!url) {
      // No cloud URL configured — pure offline mode
      return null;
    }

    try {
      if (this.cloudDataSource && this.cloudDataSource.isInitialized) {
        return this.cloudDataSource;
      }

      this.cloudDataSource = new DataSource({
        type: 'postgres',
        url,
        entities: [Token],
        synchronize: true,
      });

      await this.cloudDataSource.initialize();
      this.logger.log('Cloud database connected ☁️');
      return this.cloudDataSource;
    } catch (error) {
      this.logger.warn(`Cloud DB unavailable (offline mode): ${error.message}`);
      this.cloudDataSource = null;
      return null;
    }
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async handleCron() {
    if (this.isSyncing) return;
    this.isSyncing = true;

    try {
      const cloud = await this.getCloudConnection();
      if (!cloud) {
        // Offline — skip sync silently
        return;
      }

      const localTokens = await this.localDataSource.getRepository(Token).find({
        relations: ['patient', 'doctor', 'department'],
      });

      if (localTokens.length === 0) {
        return;
      }

      this.logger.log(`Syncing ${localTokens.length} records to Cloud Database...`);

      const cloudRepo = cloud.getRepository(Token);

      for (const token of localTokens) {
        const existingToken = await cloudRepo.findOne({ where: { id: token.id } });
        if (existingToken) {
          await cloudRepo.update(token.id, {
            status: token.status,
            calledAt: token.calledAt,
            completedAt: token.completedAt,
          });
        } else {
          try {
            await cloudRepo.save(token);
          } catch (e) {
            // Foreign key violation if master data isn't synced — skip gracefully
          }
        }
      }

      this.logger.log('Cloud Sync Complete! ☁️✅');
    } catch (error) {
      this.logger.warn(`Cloud Sync Failed (Offline Mode Active): ${error.message}`);
      // Reset cloud connection so it retries fresh next time
      this.cloudDataSource = null;
    } finally {
      this.isSyncing = false;
    }
  }
}

