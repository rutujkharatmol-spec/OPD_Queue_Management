import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Between } from 'typeorm';
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
  ) { }

  async generateToken(
    patientId?: string,
    departmentId?: string,
    doctorId?: string,
    priority: TokenPriority = TokenPriority.NORMAL,
    patientData?: { firstName?: string; lastName?: string; phone?: string; uhid?: string }
  ): Promise<Token> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const targetPatientId = patientId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : '123e4567-e89b-12d3-a456-426614174000');

    try {
      // 1. Get or Create Department, Doctor, Patient for Demo compatibility
      let department: Department | null = null;
      if (departmentId) {
        department = await queryRunner.manager.findOne(Department, { where: { id: departmentId } });
      }
      if (!department) {
        department = await queryRunner.manager.findOne(Department, { where: { code: 'MED' } });
        if (!department) {
          department = queryRunner.manager.create(Department, { name: 'Medicine', code: 'MED' });
          await queryRunner.manager.save(department);
        }
        departmentId = department.id;
      }

      let doctor = doctorId ? await queryRunner.manager.findOne(Doctor, { where: { id: doctorId } }) : null;
      if (!doctor) {
        doctor = await queryRunner.manager.findOne(Doctor, { where: { department: { id: departmentId } } });
      }
      if (!doctor) {
        doctor = queryRunner.manager.create(Doctor, {
          name: `Doctor for ${department.name}`,
          roomNumber: '101',
          department
        });
        await queryRunner.manager.save(doctor);
      }
      doctorId = doctor.id;

      let patient: Patient | null = null;
      if (patientData?.uhid) {
        patient = await queryRunner.manager.findOne(Patient, { where: { uhid: patientData.uhid } });
      }
      if (!patient && targetPatientId) {
        patient = await queryRunner.manager.findOne(Patient, { where: { id: targetPatientId } });
      }
      if (!patient && patientData?.phone && patientData.phone !== '0000000000') {
        patient = await queryRunner.manager.findOne(Patient, { where: { phone: patientData.phone } });
      }

      if (!patient) {
        const uhid = patientData?.uhid || `UHID-${Date.now().toString().slice(-6)}`;

        patient = queryRunner.manager.create(Patient, {
          id: targetPatientId,
          uhid: uhid,
          firstName: patientData?.firstName || 'Unknown',
          lastName: patientData?.lastName ?? '',
          phone: patientData?.phone || '0000000000'
        });
        await queryRunner.manager.save(patient);
      } else {
        if (patientData?.firstName) patient.firstName = patientData.firstName;
        if (patientData?.lastName !== undefined) patient.lastName = patientData.lastName;
        if (patientData?.phone && patientData.phone !== '0000000000') patient.phone = patientData.phone;
        await queryRunner.manager.save(patient);
      }

      // 2. Generate Daily Sequence Number (resets to 001 every day per department)
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      const todayTokensCount = await queryRunner.manager.count(Token, {
        where: {
          department: { id: departmentId },
          issuedAt: Between(startOfDay, endOfDay),
        },
      });

      const nextNumber = todayTokensCount + 1;
      const tokenNumber = `${department.code}-${String(nextNumber).padStart(3, '0')}`;

      // 3. Create Token
      const token = queryRunner.manager.create(Token, {
        tokenNumber,
        patient: patient,
        doctor: doctor,
        department: department,
        priority,
        status: TokenStatus.WAITING,
        issuedAt: new Date(),
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

  async searchTokens(query: string, departmentId?: string): Promise<Token[]> {
    if (!query || !query.trim()) return [];

    const trimmed = query.trim().toLowerCase();
    const qb = this.tokenRepository.createQueryBuilder('token')
      .leftJoinAndSelect('token.patient', 'patient')
      .leftJoinAndSelect('token.doctor', 'doctor')
      .leftJoinAndSelect('token.department', 'department')
      .where(
        '(LOWER(COALESCE(token.tokenNumber, \'\')) LIKE :q OR LOWER(COALESCE(patient.uhid, \'\')) LIKE :q OR LOWER(COALESCE(patient.firstName, \'\')) LIKE :q OR LOWER(COALESCE(patient.lastName, \'\')) LIKE :q OR COALESCE(patient.phone, \'\') LIKE :q)',
        { q: `%${trimmed}%` }
      )
      .orderBy('token.issuedAt', 'DESC')
      .take(20);

    if (departmentId) {
      qb.andWhere('department.id = :departmentId', { departmentId });
    }

    return qb.getMany();
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
