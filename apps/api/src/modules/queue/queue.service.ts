import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Between } from 'typeorm';
import { Token, TokenStatus, TokenPriority } from '../tokens/entities/token.entity';
import { Queue, QueueStatus } from './entities/queue.entity';
import { Department } from '../departments/entities/department.entity';
import { Doctor } from '../doctors/entities/doctor.entity';
import { Room } from '../settings/entities/room.entity';
import { TokenAction } from './dto/mark-token-action.dto';

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
  ) { }

  async callNextPatient(departmentId: string, roomNumber: string): Promise<Token | null> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Find the department and doctor for this department
      let dept = departmentId ? await queryRunner.manager.findOne(Department, { where: { id: departmentId } }) : null;
      if (!dept) {
        dept = await queryRunner.manager.findOne(Department, { where: { code: 'MED' } });
        if (!dept) {
          dept = await queryRunner.manager.findOne(Department, { where: { isActive: true } });
        }
        if (!dept) {
          dept = queryRunner.manager.create(Department, { name: 'Medicine', code: 'MED', isActive: true });
          await queryRunner.manager.save(dept);
        }
        departmentId = dept.id;
      }

      let doctor = await queryRunner.manager.findOne(Doctor, { where: { department: { id: departmentId } }, relations: ['department'] });

      if (!doctor) {
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

      // 3. Find next waiting token in this department
      const nextToken = await queryRunner.manager.findOne(Token, {
        where: {
          department: { id: departmentId },
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
      nextToken.doctor = doctor;
      nextToken.status = TokenStatus.CALLED;
      nextToken.calledAt = new Date();
      nextToken.recalledAt = null as any;
      nextToken.roomNumber = roomNumber;
      await queryRunner.manager.save(nextToken);

      queue.currentToken = nextToken;
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

  async recallPatient(departmentId: string, roomNumber: string): Promise<Token> {
    let dept = departmentId ? await this.departmentRepository.findOne({ where: { id: departmentId } }) : null;
    if (!dept) {
      dept = await this.departmentRepository.findOne({ where: { code: 'MED' } }) || await this.departmentRepository.findOne({ where: { isActive: true } });
    }
    const targetDeptId = dept ? dept.id : departmentId;
    let doctor = await this.dataSource.manager.findOne(Doctor, { where: { department: { id: targetDeptId } } });
    if (!doctor) throw new NotFoundException('Doctor/Department not found');

    const activeToken = await this.tokenRepository.findOne({
      where: {
        doctor: { id: doctor.id },
        roomNumber: roomNumber,
        status: TokenStatus.CALLED,
      },
      relations: ['patient', 'department', 'doctor'],
    });

    if (!activeToken) {
      throw new NotFoundException(`No active patient currently called in room ${roomNumber}`);
    }

    activeToken.recalledAt = new Date();
    await this.tokenRepository.save(activeToken);
    return activeToken;
  }

  async markTokenAction(tokenId: string, action: TokenAction | string): Promise<Token> {
    const token = await this.tokenRepository.findOne({
      where: { id: tokenId },
      relations: ['doctor']
    });

    if (!token) throw new NotFoundException('Token not found');

    if (action === TokenAction.SKIP) {
      token.status = TokenStatus.SKIPPED;
    } else if (action === TokenAction.RETURN_TO_QUEUE || action === TokenAction.RESET_TO_WAITING) {
      token.status = TokenStatus.WAITING;
      token.calledAt = null as any;
      token.recalledAt = null as any;
      token.roomNumber = null as any;
    } else if (action === TokenAction.NOT_AVAILABLE) {
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
      token.recalledAt = null as any;
      token.roomNumber = null as any;
    } else if (action === TokenAction.ABSENT) {
      token.status = TokenStatus.ABSENT;
    } else if (action === TokenAction.COMPLETE) {
      token.status = TokenStatus.COMPLETED;
      token.completedAt = new Date();
    }

    await this.tokenRepository.save(token);
    return token;
  }

  async getDepartmentAnalytics(departmentId?: string, dateStr?: string) {
    const targetDate = dateStr ? new Date(dateStr) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const whereClause: any = {
      issuedAt: Between(startOfDay, endOfDay),
    };

    if (departmentId) {
      whereClause.department = { id: departmentId };
    }

    const tokens = await this.tokenRepository.find({
      where: whereClause,
      relations: ['patient', 'doctor', 'department'],
    });

    const totalGenerated = tokens.length;
    const completed = tokens.filter(t => t.status === TokenStatus.COMPLETED);
    const waiting = tokens.filter(t => t.status === TokenStatus.WAITING);
    const called = tokens.filter(t => t.status === TokenStatus.CALLED);
    const absent = tokens.filter(t => t.status === TokenStatus.ABSENT);
    const skipped = tokens.filter(t => t.status === TokenStatus.SKIPPED);

    // Priority counts
    const priorityCounts = {
      emergency: tokens.filter(t => t.priority === TokenPriority.EMERGENCY).length,
      senior: tokens.filter(t => t.priority === TokenPriority.SENIOR).length,
      normal: tokens.filter(t => t.priority === TokenPriority.NORMAL).length,
    };

    // Calculate Average Wait Time (mins) for tokens that were called/completed
    const waitTimes = tokens
      .filter(t => t.calledAt && t.issuedAt)
      .map(t => (new Date(t.calledAt).getTime() - new Date(t.issuedAt).getTime()) / (1000 * 60));

    const avgWaitTimeMins = waitTimes.length > 0
      ? Math.round(waitTimes.reduce((acc, val) => acc + val, 0) / waitTimes.length)
      : 0;

    // Calculate Average Consultation Time (mins) for completed tokens
    const consultationTimes = completed
      .filter(t => t.calledAt && t.completedAt)
      .map(t => (new Date(t.completedAt).getTime() - new Date(t.calledAt).getTime()) / (1000 * 60));

    const avgConsultationTimeMins = consultationTimes.length > 0
      ? Math.round(consultationTimes.reduce((acc, val) => acc + val, 0) / consultationTimes.length)
      : 0;

    // Hourly Distribution (8 AM - 6 PM)
    const hourlyDistribution: Record<string, number> = {};
    for (let h = 8; h <= 18; h++) {
      const label = `${String(h).padStart(2, '0')}:00`;
      hourlyDistribution[label] = 0;
    }

    tokens.forEach(t => {
      const hour = new Date(t.issuedAt).getHours();
      const label = `${String(hour).padStart(2, '0')}:00`;
      if (hourlyDistribution[label] !== undefined) {
        hourlyDistribution[label]++;
      }
    });

    // Room-wise statistics
    const roomStats: Record<string, { roomNumber: string; totalServed: number }> = {};
    completed.forEach(t => {
      const room = t.roomNumber || '101';
      if (!roomStats[room]) {
        roomStats[room] = { roomNumber: room, totalServed: 0 };
      }
      roomStats[room].totalServed++;
    });

    return {
      date: startOfDay.toISOString().split('T')[0],
      totalGenerated,
      completedCount: completed.length,
      waitingCount: waiting.length,
      calledCount: called.length,
      absentCount: absent.length,
      skippedCount: skipped.length,
      priorityCounts,
      avgWaitTimeMins,
      avgConsultationTimeMins,
      hourlyDistribution,
      roomStats: Object.values(roomStats),
    };
  }

  async getLiveQueueByDepartment(departmentId: string) {
    const department = await this.departmentRepository.findOne({ where: { id: departmentId } });
    let doctor = await this.dataSource.manager.findOne(Doctor, { where: { department: { id: departmentId } } });

    if (!doctor) {
      return {
        department: department?.name || 'Department',
        activeTokens: [],
        nextTokens: []
      };
    }

    return this.buildQueueUpdatePayload(departmentId, doctor.id, department);
  }

  // Helper method to gather current state for polling
  private async buildQueueUpdatePayload(departmentId: string, doctorId: string, department: Department | null) {
    // Find rooms for doctor names
    const rooms = await this.dataSource.manager.find(Room, {
      where: departmentId ? { department: { id: departmentId } } : {},
    });
    const roomDoctorMap = new Map<string, string>();
    rooms.forEach(r => {
      if (r.doctorName) roomDoctorMap.set(r.roomNumber, r.doctorName);
    });

    // Find all actively serving tokens for this department
    const activeTokensRaw = await this.tokenRepository.find({
      where: departmentId
        ? { department: { id: departmentId }, status: TokenStatus.CALLED }
        : { status: TokenStatus.CALLED },
      order: {
        calledAt: 'DESC',
      },
      relations: ['patient']
    });

    const activeTokens = activeTokensRaw.map(t => {
      const rNum = t.roomNumber || '101';
      return {
        id: t.id,
        token: t.tokenNumber,
        room: rNum,
        doctorName: roomDoctorMap.get(rNum) || undefined,
        patientName: t.patient ? `${t.patient.firstName || ''} ${t.patient.lastName || ''}`.trim() || 'Patient' : 'Patient',
        uhid: t.patient?.uhid || '',
        recalledAt: t.recalledAt ? new Date(t.recalledAt).getTime() : undefined,
        calledAt: t.calledAt ? new Date(t.calledAt).getTime() : undefined,
      };
    });

    const waitingTokens = await this.tokenRepository.find({
      where: departmentId
        ? { department: { id: departmentId }, status: TokenStatus.WAITING }
        : { status: TokenStatus.WAITING },
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
