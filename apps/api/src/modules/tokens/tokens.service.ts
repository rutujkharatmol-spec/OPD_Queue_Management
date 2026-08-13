import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
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
    patientData?: { firstName?: string; lastName?: string; phone?: string; uhid?: string }
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

      let doctor = await queryRunner.manager.findOne(Doctor, { where: { department: { id: departmentId } } });
      if (!doctor) {
        doctor = queryRunner.manager.create(Doctor, { 
          name: `Doctor for ${department.name}`, 
          roomNumber: '101', 
          department 
        });
        await queryRunner.manager.save(doctor);
      }
      doctorId = doctor.id;

      let patient = await queryRunner.manager.findOne(Patient, { where: { id: patientId } });
      if (!patient) {
        // Use the generated UUID to create a fresh patient record!
        // Use provided UHID or generate a random one based on timestamp
        const uhid = patientData?.uhid || `UHID-${Date.now().toString().slice(-6)}`;
        
        patient = queryRunner.manager.create(Patient, { 
          id: patientId, 
          uhid: uhid, 
          firstName: patientData?.firstName || 'Unknown', 
          lastName: patientData?.lastName ?? '', 
          phone: patientData?.phone || '0000000000' 
        });
        await queryRunner.manager.save(patient);
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
  async getTokenStatus(tokenNumber: string) {
    const token = await this.tokenRepository.findOne({
      where: { tokenNumber },
      relations: ['doctor', 'department'],
    });

    if (!token) {
      throw new NotFoundException('Token not found');
    }

    const doctorId = token.doctor.id;

    // Get currently serving token(s) for this doctor
    const currentlyServing = await this.tokenRepository.find({
      where: { doctor: { id: doctorId }, status: TokenStatus.CALLED },
      select: ['tokenNumber', 'roomNumber'],
    });

    let patientsAhead = 0;
    let estimatedWaitTimeMins = 0;

    if (token.status === TokenStatus.WAITING) {
      // Find all waiting tokens for this doctor
      const waitingQueue = await this.tokenRepository.find({
        where: { doctor: { id: doctorId }, status: TokenStatus.WAITING },
      });

      // Count how many are ahead of THIS token
      // Ahead = priority > token.priority OR (priority == token.priority AND issuedAt < token.issuedAt)
      
      // We map priorities to numbers for easier comparison
      const priorityWeight = {
        [TokenPriority.EMERGENCY]: 3,
        [TokenPriority.SENIOR]: 2,
        [TokenPriority.NORMAL]: 1,
      };

      const myWeight = priorityWeight[token.priority];

      patientsAhead = waitingQueue.filter(t => {
        const tWeight = priorityWeight[t.priority];
        if (tWeight > myWeight) return true;
        if (tWeight === myWeight && t.issuedAt.getTime() < token.issuedAt.getTime()) return true;
        return false;
      }).length;

      // 5 minutes per patient ahead + 5 minutes if there is someone currently serving
      estimatedWaitTimeMins = patientsAhead * 5 + (currentlyServing.length > 0 ? 5 : 0);
    }

    return {
      tokenNumber: token.tokenNumber,
      status: token.status,
      priority: token.priority,
      departmentName: token.department?.name || 'Department',
      roomNumber: token.roomNumber || token.doctor?.roomNumber,
      currentlyServing: currentlyServing.map(t => t.tokenNumber),
      patientsAhead: token.status === TokenStatus.WAITING ? patientsAhead : 0,
      estimatedWaitTimeMins: token.status === TokenStatus.WAITING ? estimatedWaitTimeMins : 0,
    };
  }
}
