import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../shared/entities/base.entity';
import { Department } from '../../departments/entities/department.entity';

@Entity('rooms')
export class Room extends BaseEntity {
  @Column({ name: 'room_number' })
  roomNumber: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'doctor_name', nullable: true })
  doctorName: string;

  @ManyToOne(() => Department)
  @JoinColumn({ name: 'department_id' })
  department: Department;
}

