import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Token, TokenPriority, TokenStatus } from './entities/token.entity';
import { Patient } from '../patients/entities/patient.entity';
import { Doctor } from '../doctors/entities/doctor.entity';
import { Department } from '../departments/entities/department.entity';
import { Queue, QueueStatus } from '../queue/entities/queue.entity';

import { QueueService } from '../queue/queue.service';

@Injectable()
export class TokensService {
  constructor(
    @InjectRepository(Token)
    private readonly tokenRepository: Repository<Token>,
    @InjectRepository(Queue)
    private readonly queueRepository: Repository<Queue>,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    private readonly dataSource: DataSource,
    private readonly queueService: QueueService,
  ) {}

  async generateToken(
    patientId: string,
    departmentId: string,
    doctorId: string,
    priority: TokenPriority = TokenPriority.NORMAL,
  ): Promise<Token> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Get or Create Department, Doctor, Patient for Demo compatibility
      let department = await queryRunner.manager.findOne(Department, { where: { id: departmentId } });
      if (!department) {
        // Fallback check by unique code to prevent duplicate key errors
        department = await queryRunner.manager.findOne(Department, { where: { code: 'MED' } });
        if (!department) {
          department = queryRunner.manager.create(Department, { id: departmentId, name: 'Medicine', code: 'MED' });
          await queryRunner.manager.save(department);
        } else {
          // If found by code but different ID, we must use the existing ID in our token
          departmentId = department.id;
        }
      }

      let doctor = await queryRunner.manager.findOne(Doctor, { where: { id: doctorId } });
      if (!doctor) {
        doctor = await queryRunner.manager.findOne(Doctor, { where: { name: 'Dr. Sharma' } });
        if (!doctor) {
          doctor = queryRunner.manager.create(Doctor, { id: doctorId, name: 'Dr. Sharma', roomNumber: '104', department });
          await queryRunner.manager.save(doctor);
        } else {
          doctorId = doctor.id;
        }
      }

      let patient = await queryRunner.manager.findOne(Patient, { where: { id: patientId } });
      if (!patient) {
        patient = await queryRunner.manager.findOne(Patient, { where: { uhid: 'UHID-DEMO-123' } });
        if (!patient) {
          patient = queryRunner.manager.create(Patient, { 
            id: patientId, 
            uhid: 'UHID-DEMO-123', 
            firstName: 'Rahul', 
            lastName: 'Kumar', 
            phone: '9876543210' 
          });
          await queryRunner.manager.save(patient);
        } else {
          patientId = patient.id;
        }
      }

      // 2. Generate Daily Sequence Number
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      const todayTokensCount = await queryRunner.manager.count(Token, {
        where: {
          department: { id: departmentId },
        },
      });
      
      const nextNumber = todayTokensCount + 1;
      const tokenNumber = `${department.code}-${String(nextNumber).padStart(3, '0')}`;

      // 3. Create Token
      const token = queryRunner.manager.create(Token, {
        tokenNumber,
        patient: { id: patientId },
        doctor: { id: doctorId },
        department: { id: departmentId },
        priority,
        status: TokenStatus.WAITING,
      });

      await queryRunner.manager.save(token);
      await queryRunner.commitTransaction();

      // Emit real-time update
      await this.queueService.emitQueueUpdate(departmentId, doctorId);

      return token;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getDoctorQueue(doctorId: string): Promise<Token[]> {
    return this.tokenRepository.find({
      where: {
        doctor: { id: doctorId },
        status: TokenStatus.WAITING,
      },
      order: {
        // Priority ordering (EMERGENCY first, then SENIOR, then NORMAL)
        priority: 'DESC', 
        issuedAt: 'ASC', // Then FIFO
      },
      relations: ['patient'],
    });
  }
}
