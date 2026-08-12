import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull } from 'typeorm';
import { Token, TokenStatus } from '../tokens/entities/token.entity';
import { Queue, QueueStatus } from './entities/queue.entity';

import { QueueGateway } from './queue.gateway';
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
    private readonly queueGateway: QueueGateway,
  ) {}

  async callNextPatient(doctorId: string): Promise<Token> {
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
            name: 'Dr. Sharma',
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

      // 2. Mark current token as completed if it exists and wasn't skipped
      if (queue.currentToken && queue.currentToken.status === TokenStatus.CALLED) {
        queue.currentToken.status = TokenStatus.COMPLETED;
        queue.currentToken.completedAt = new Date();
        await queryRunner.manager.save(queue.currentToken);
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
        
        // Emit WebSocket event to update displays even if empty
        const emptyDepartmentId = queue.doctor?.department?.id || '660e8400-e29b-41d4-a716-446655440000';
        await this.emitQueueUpdate(emptyDepartmentId, doctorId);
        
        return null;
      }

      // 4. Update Token and Queue
      nextToken.status = TokenStatus.CALLED;
      nextToken.calledAt = new Date();
      await queryRunner.manager.save(nextToken);

      queue.currentToken = nextToken;
      await queryRunner.manager.save(queue);

      await queryRunner.commitTransaction();
      
      // Emit WebSocket event to update displays
      const departmentId = nextToken.department?.id || queue.doctor?.department?.id;
      if (departmentId) {
        await this.emitQueueUpdate(departmentId, doctorId);
      }

      return nextToken;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async markTokenAction(tokenId: string, action: 'SKIP' | 'ABSENT' | 'COMPLETE'): Promise<Token> {
    const token = await this.tokenRepository.findOne({ where: { id: tokenId } });
    if (!token) throw new NotFoundException('Token not found');

    if (action === 'SKIP') {
      token.status = TokenStatus.SKIPPED;
    } else if (action === 'ABSENT') {
      token.status = TokenStatus.ABSENT;
    } else if (action === 'COMPLETE') {
      token.status = TokenStatus.COMPLETED;
      token.completedAt = new Date();
    }

    await this.tokenRepository.save(token);
    
    // Emit Update
    const departmentId = token.department?.id || token.doctor?.department?.id;
    if (departmentId) {
      await this.emitQueueUpdate(departmentId, token.doctor.id);
    }

    return token;
  }

  public async emitQueueUpdate(departmentId: string, doctorId: string) {
    const queueData = await this.buildQueueUpdatePayload(departmentId, doctorId);
    this.queueGateway.broadcastQueueUpdate(departmentId, doctorId, queueData);
  }

  // Helper method to gather current state for broadcasting
  private async buildQueueUpdatePayload(departmentId: string, doctorId: string) {
    const department = await this.departmentRepository.findOne({ where: { id: departmentId } });
    const queue = await this.queueRepository.findOne({
      where: { doctor: { id: doctorId } },
      order: { createdAt: 'DESC' },
      relations: ['currentToken', 'doctor'],
    });
    
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
      department: department?.name || 'Department',
      doctorName: queue?.doctor?.name || 'Doctor',
      roomNumber: queue?.doctor?.roomNumber || 'TBD',
      currentToken: queue?.currentToken?.tokenNumber || null,
      nextTokens: waitingTokens.map(t => t.priority === TokenPriority.EMERGENCY ? `${t.tokenNumber} 🚨` : t.tokenNumber)
    };
  }
}
