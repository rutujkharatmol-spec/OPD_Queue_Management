import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { QueueModule } from './modules/queue/queue.module';
import { TokensModule } from './modules/tokens/tokens.module';
import { SettingsModule } from './modules/settings/settings.module';
import { DepartmentsModule } from './modules/departments/departments.module';

import { Queue } from './modules/queue/entities/queue.entity';
import { Token } from './modules/tokens/entities/token.entity';
import { Department } from './modules/departments/entities/department.entity';
import { Doctor } from './modules/doctors/entities/doctor.entity';
import { Patient } from './modules/patients/entities/patient.entity';
import { User } from './modules/auth/entities/user.entity';
import { AuditLog } from './modules/audit/entities/audit-log.entity';
import { Room } from './modules/settings/entities/room.entity';
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

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      autoLoadEntities: true,
      entities: [Queue, Token, Department, Doctor, Patient, User, AuditLog, Room],
      synchronize: true,
    }),
    ScheduleModule.forRoot(),
    QueueModule,
    TokensModule,
    SettingsModule,
    DepartmentsModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule { }
