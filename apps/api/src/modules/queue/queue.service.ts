import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull, Between } from 'typeorm';
import { Token, TokenStatus } from '../tokens/entities/token.entity';
import { Queue, QueueStatus } from './entities/queue.entity';

import { Department } from '../departments/entities/department.entity';
import { Doctor } from '../doctors/entities/doctor.entity';
import { TokenPriority } from '../tokens/entities/token.entity';
import { Room } from '../settings/entities/room.entity';

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

  async callNextPatient(departmentId: string, roomNumber: string): Promise<Token> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Find the doctor for this department
      let doctor = await queryRunner.manager.findOne(Doctor, { where: { department: { id: departmentId } }, relations: ['department'] });
      
      if (!doctor) {
        let dept = await queryRunner.manager.findOne(Department, { where: { id: departmentId } });
        if (!dept) throw new NotFoundException('Department not found');
        
        doctor = queryRunner.manager.create(Doctor, {
          name: `Doctor for ${dept.name}`,
          roomNumber: roomNumber,
          department: dept
        });
        await queryRunner.manager.save(doctor);
      }
      
      const doctorId = doctor.id;

      // Get today's queue for this doctor
      let queue = await queryRunner.manager.findOne(Queue, {
        where: { doctor: { id: doctorId } },
        order: { createdAt: 'DESC' },
        relations: ['currentToken', 'doctor', 'doctor.department'],
      });

      if (!queue) {
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

  /**
   * Recall / re-announce a patient in a specific room.
   * Updates calledAt timestamp so the TV display detects a change and re-announces.
   */
  async recallPatient(departmentId: string, roomNumber: string): Promise<Token | null> {
    const doctor = await this.dataSource.manager.findOne(Doctor, { where: { department: { id: departmentId } } });
    if (!doctor) return null;

    const activeToken = await this.tokenRepository.findOne({
      where: {
        doctor: { id: doctor.id },
        roomNumber: roomNumber,
        status: TokenStatus.CALLED,
      },
      relations: ['patient'],
    });

    if (!activeToken) return null;

    // Bump calledAt to trigger re-announcement detection on client
    activeToken.calledAt = new Date();
    await this.tokenRepository.save(activeToken);

    return activeToken;
  }

  async getLiveQueueByDepartment(departmentId: string) {
    const department = await this.departmentRepository.findOne({ where: { id: departmentId } });
    let doctor = await this.dataSource.manager.findOne(Doctor, { where: { department: { id: departmentId } } });
    
    if (!doctor) {
      // If no doctor exists for this department yet, the queue is effectively empty.
      return {
        department: department?.name || 'Department',
        activeTokens: [],
        nextTokens: []
      };
    }

    return this.buildQueueUpdatePayload(departmentId, doctor.id, department);
  }

  /**
   * Get daily analytics for a department.
   */
  async getDepartmentAnalytics(departmentId: string) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const department = await this.departmentRepository.findOne({ where: { id: departmentId } });
    const doctor = await this.dataSource.manager.findOne(Doctor, { where: { department: { id: departmentId } } });
    
    if (!doctor) {
      return {
        departmentName: department?.name || 'Department',
        date: new Date().toISOString().split('T')[0],
        totalTokens: 0,
        waiting: 0,
        called: 0,
        completed: 0,
        absent: 0,
        skipped: 0,
        emergencyCount: 0,
        seniorCount: 0,
        normalCount: 0,
        avgConsultationMins: 0,
        hourlyBreakdown: [],
      };
    }

    const todayTokens = await this.tokenRepository.find({
      where: {
        doctor: { id: doctor.id },
        issuedAt: Between(startOfDay, endOfDay),
      },
    });

    const waiting = todayTokens.filter(t => t.status === TokenStatus.WAITING).length;
    const called = todayTokens.filter(t => t.status === TokenStatus.CALLED).length;
    const completed = todayTokens.filter(t => t.status === TokenStatus.COMPLETED).length;
    const absent = todayTokens.filter(t => t.status === TokenStatus.ABSENT).length;
    const skipped = todayTokens.filter(t => t.status === TokenStatus.SKIPPED).length;

    const emergencyCount = todayTokens.filter(t => t.priority === TokenPriority.EMERGENCY).length;
    const seniorCount = todayTokens.filter(t => t.priority === TokenPriority.SENIOR).length;
    const normalCount = todayTokens.filter(t => t.priority === TokenPriority.NORMAL).length;

    // Average consultation time (calledAt to completedAt for completed tokens)
    const completedWithTimes = todayTokens.filter(t => t.status === TokenStatus.COMPLETED && t.calledAt && t.completedAt);
    let avgConsultationMins = 0;
    if (completedWithTimes.length > 0) {
      const totalMins = completedWithTimes.reduce((sum, t) => {
        const diff = (t.completedAt.getTime() - t.calledAt.getTime()) / 60000;
        return sum + diff;
      }, 0);
      avgConsultationMins = Math.round(totalMins / completedWithTimes.length);
    }

    // Hourly breakdown (tokens registered per hour)
    const hourlyBreakdown: { hour: string; count: number }[] = [];
    for (let h = 6; h <= 20; h++) {
      const hourStart = new Date(startOfDay);
      hourStart.setHours(h, 0, 0, 0);
      const hourEnd = new Date(startOfDay);
      hourEnd.setHours(h, 59, 59, 999);
      const count = todayTokens.filter(t => t.issuedAt >= hourStart && t.issuedAt <= hourEnd).length;
      if (count > 0 || h >= 8 && h <= 17) {
        hourlyBreakdown.push({
          hour: `${String(h).padStart(2, '0')}:00`,
          count,
        });
      }
    }

    return {
      departmentName: department?.name || 'Department',
      date: new Date().toISOString().split('T')[0],
      totalTokens: todayTokens.length,
      waiting,
      called,
      completed,
      absent,
      skipped,
      emergencyCount,
      seniorCount,
      normalCount,
      avgConsultationMins,
      hourlyBreakdown,
    };
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

    // Get rooms with doctor names for this department
    const rooms = await this.dataSource.manager.find(Room, {
      where: { department: { id: departmentId } },
    });
    const roomDoctorMap: Record<string, string> = {};
    for (const r of rooms) {
      if (r.doctorName) {
        roomDoctorMap[r.roomNumber] = r.doctorName;
      }
    }

    const activeTokens = activeTokensRaw.map(t => ({
      id: t.id,
      token: t.tokenNumber,
      room: t.roomNumber || '104',
      calledAt: t.calledAt?.toISOString() || null,
      doctorName: roomDoctorMap[t.roomNumber] || null,
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

