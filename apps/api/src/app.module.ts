import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { QueueModule } from './modules/queue/queue.module';
import { TokensModule } from './modules/tokens/tokens.module';
import { SettingsModule } from './modules/settings/settings.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { SyncModule } from './modules/sync/sync.module';

import { Queue } from './modules/queue/entities/queue.entity';
import { Token } from './modules/tokens/entities/token.entity';
import { Department } from './modules/departments/entities/department.entity';
import { Doctor } from './modules/doctors/entities/doctor.entity';
import { Patient } from './modules/patients/entities/patient.entity';
import { User } from './modules/auth/entities/user.entity';
import { AuditLog } from './modules/audit/entities/audit-log.entity';
import { Room } from './modules/settings/entities/room.entity';
import { SyncState } from './modules/sync/entities/sync-state.entity';
import { AppController } from './app.controller';

import * as fs from 'fs';
import * as path from 'path';

try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
      const parts = line.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
        if (key && !process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }
} catch (e) {}

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not set. On the OPD server point it at the local Postgres ' +
      '(e.g. postgresql://opd:password@127.0.0.1:5432/opd); in a cloud deployment set it ' +
      'in the host\'s environment variables. Copy .env.example to .env for local development.'
  );
}

@Module({
  imports: [
    // DATABASE_URL is whatever this instance treats as its source of truth: the
    // hospital's local Postgres on the OPD server, or Neon for the read-only cloud
    // mirror. Sync direction is decided by CLOUD_SYNC_URL (see SyncService).
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      autoLoadEntities: true,
      entities: [Queue, Token, Department, Doctor, Patient, User, AuditLog, Room, SyncState],
      synchronize: true,
    }),
    ScheduleModule.forRoot(),
    QueueModule,
    TokensModule,
    SettingsModule,
    DepartmentsModule,
    SyncModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule { }
