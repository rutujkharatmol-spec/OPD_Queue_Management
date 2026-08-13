import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../shared/entities/base.entity';
import { Patient } from '../../patients/entities/patient.entity';
import { Doctor } from '../../doctors/entities/doctor.entity';
import { Department } from '../../departments/entities/department.entity';

export enum TokenStatus {
  WAITING = 'WAITING',
  CALLED = 'CALLED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  SKIPPED = 'SKIPPED',
  ABSENT = 'ABSENT',
}

export enum TokenPriority {
  NORMAL = 'NORMAL',
  SENIOR = 'SENIOR',
  EMERGENCY = 'EMERGENCY',
}

@Entity('tokens')
export class Token extends BaseEntity {
  @Column({ name: 'token_number' })
  tokenNumber: string;

  @ManyToOne(() => Patient)
  @JoinColumn({ name: 'patient_id' })
  patient: Patient;

  @ManyToOne(() => Doctor)
  @JoinColumn({ name: 'doctor_id' })
  doctor: Doctor;

  @ManyToOne(() => Department)
  @JoinColumn({ name: 'department_id' })
  department: Department;

  @Column({
    type: 'enum',
    enum: TokenStatus,
    default: TokenStatus.WAITING,
  })
  status: TokenStatus;

  @Column({ name: 'room_number', nullable: true })
  roomNumber: string;

  @Column({
    type: 'enum',
    enum: TokenPriority,
    default: TokenPriority.NORMAL,
  })
  priority: TokenPriority;

  @Column({ name: 'issued_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  issuedAt: Date;

  @Column({ name: 'called_at', type: 'timestamp', nullable: true })
  calledAt: Date;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date;

  @Column({ name: 'absent_count', type: 'int', default: 0 })
  absentCount: number;
}
