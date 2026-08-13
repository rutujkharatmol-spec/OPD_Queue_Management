import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull } from 'typeorm';
import { Token, TokenStatus } from '../tokens/entities/token.entity';
import { Queue, QueueStatus } from './entities/queue.entity';

import { Department } from '../departments/entities/department.entity';
import { Doctor } from '../doctors/entities/doctor.entity';
import { TokenPriority } from '../tokens/entities/token.entity';

@Injectable()
export class QueueService {
  constructor(
    @InjectRepository(Token)
    private readonly tokenRepository: Repository<Token>,
    @InjectRepository(Queue)
    private readonly queueRepository: Repository<Queue>,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    private readonly dataSource: DataSource,
  ) {}

  async callNextPatient(doctorId: string, roomNumber: string): Promise<Token> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Get today's queue for this doctor
      let queue = await queryRunner.manager.findOne(Queue, {
        where: { doctor: { id: doctorId } },
        order: { createdAt: 'DESC' },
        relations: ['currentToken', 'doctor', 'doctor.department'],
      });

      if (!queue) {
        // Ensure doctor exists to prevent Postgres foreign key errors on a fresh DB
        let doctor = await queryRunner.manager.findOne(Doctor, { where: { id: doctorId }, relations: ['department'] });
        if (!doctor) {
          let dept = await queryRunner.manager.findOne(Department, { where: { name: 'Medicine' } });
          if (!dept) {
            dept = queryRunner.manager.create(Department, { name: 'Medicine', code: 'MED' });
            await queryRunner.manager.save(dept);
          }
          doctor = queryRunner.manager.create(Doctor, {
            id: doctorId,
            name: 'Consulting Doctor',
            roomNumber: '104',
            department: dept
          });
          await queryRunner.manager.save(doctor);
        }

        queue = queryRunner.manager.create(Queue, {
          doctor: { id: doctorId },
          queueDate: new Date(),
          status: QueueStatus.OPEN,
        });
        await queryRunner.manager.save(queue);
      }

      if (queue.status !== QueueStatus.OPEN) {
        throw new BadRequestException('Queue is not OPEN.');
      }

      // 2. Mark any token currently CALLED in this specific room as completed
      const currentTokensInRoom = await queryRunner.manager.find(Token, {
        where: {
          doctor: { id: doctorId },
          roomNumber: roomNumber,
          status: TokenStatus.CALLED,
        },
      });

      for (const t of currentTokensInRoom) {
        t.status = TokenStatus.COMPLETED;
        t.completedAt = new Date();
        await queryRunner.manager.save(t);
      }

      // 3. Find next waiting token
      const nextToken = await queryRunner.manager.findOne(Token, {
        where: {
          doctor: { id: doctorId },
          status: TokenStatus.WAITING,
        },
        order: {
          priority: 'DESC',
          issuedAt: 'ASC',
        },
      });

      if (!nextToken) {
        // Queue is empty
        queue.currentToken = null;
        await queryRunner.manager.save(queue);
        await queryRunner.commitTransaction();
        return null;
      }

      // 4. Update Token and Queue
      nextToken.status = TokenStatus.CALLED;
      nextToken.calledAt = new Date();
      nextToken.roomNumber = roomNumber;
      await queryRunner.manager.save(nextToken);

      queue.currentToken = nextToken; // Keeping this for backward compatibility or general tracking, though we now rely on activeTokens
      await queryRunner.manager.save(queue);

      await queryRunner.commitTransaction();
      return nextToken;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async markTokenAction(tokenId: string, action: 'SKIP' | 'ABSENT' | 'NOT_AVAILABLE' | 'COMPLETE'): Promise<Token> {
    const token = await this.tokenRepository.findOne({ 
      where: { id: tokenId },
      relations: ['doctor'] 
    });
    
    if (!token) throw new NotFoundException('Token not found');

    if (action === 'SKIP') {
      token.status = TokenStatus.SKIPPED;
    } else if (action === 'NOT_AVAILABLE') {
      // Penalty: +3 first time, +6 second time (and beyond)
      const penalty = token.absentCount === 0 ? 3 : 6;
      
      const waitingList = await this.tokenRepository.find({
        where: { 
          doctor: { id: token.doctor.id }, 
          status: TokenStatus.WAITING, 
          priority: token.priority 
        },
        order: { issuedAt: 'ASC' }
      });

      if (waitingList.length <= penalty) {
        token.issuedAt = new Date();
      } else {
        // Push back by 'penalty' positions within same priority
        token.issuedAt = new Date(waitingList[penalty - 1].issuedAt.getTime() + 1);
      }

      token.absentCount += 1;
      token.status = TokenStatus.WAITING; // Send back to waiting
      token.calledAt = null as any;
      token.roomNumber = null as any;
    } else if (action === 'ABSENT') {
      token.status = TokenStatus.ABSENT;
    } else if (action === 'COMPLETE') {
      token.status = TokenStatus.COMPLETED;
      token.completedAt = new Date();
    }

    await this.tokenRepository.save(token);
    return token;
  }

  async getLiveQueueByDepartment(departmentId: string) {
    const department = await this.departmentRepository.findOne({ where: { id: departmentId } });
    let doctor = await this.dataSource.manager.findOne(Doctor, { where: { department: { id: departmentId } } });
    
    // Fallback for mock data if no doctor is explicitly tied to this new department ID yet
    const doctorId = doctor ? doctor.id : '550e8400-e29b-41d4-a716-446655440000';

    return this.buildQueueUpdatePayload(departmentId, doctorId, department);
  }

  // Helper method to gather current state for polling
  private async buildQueueUpdatePayload(departmentId: string, doctorId: string, department: Department | null) {
    const queue = await this.queueRepository.findOne({
      where: { doctor: { id: doctorId } },
      order: { createdAt: 'DESC' },
      relations: ['currentToken', 'doctor'],
    });
    
    // Find all actively serving tokens for this doctor/department
    const activeTokensRaw = await this.tokenRepository.find({
      where: {
        doctor: { id: doctorId },
        status: TokenStatus.CALLED,
      },
      relations: ['patient']
    });

    const activeTokens = activeTokensRaw.map(t => ({
      id: t.id,
      token: t.tokenNumber,
      room: t.roomNumber || '104',
      patientName: t.patient ? `${t.patient.firstName} ${t.patient.lastName}`.trim() : 'Unknown Patient',
      uhid: t.patient?.uhid || '---'
    }));

    const waitingTokens = await this.tokenRepository.find({
      where: {
        doctor: { id: doctorId },
        status: TokenStatus.WAITING,
      },
      order: {
        priority: 'DESC', 
        issuedAt: 'ASC',
      }
    });
    
    return {
      department: department?.name || 'Medicine',
      activeTokens,
      nextTokens: waitingTokens.map(t => t.priority === TokenPriority.EMERGENCY ? `${t.tokenNumber} 🚨` : t.tokenNumber)
    };
  }
}
