import { Column, Entity, JoinColumn, ManyToOne, OneToOne } from 'typeorm';
import { BaseEntity } from '../../shared/entities/base.entity';
import { User } from '../../auth/entities/user.entity';
import { Department } from '../../departments/entities/department.entity';

@Entity('doctors')
export class Doctor extends BaseEntity {
  @OneToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column()
  name: string;

  @ManyToOne(() => Department, (department) => department.doctors)
  @JoinColumn({ name: 'department_id' })
  department: Department;

  @Column({ nullable: true })
  specialization: string;

  @Column({ name: 'room_number', nullable: true })
  roomNumber: string;

  @Column({ name: 'is_available', default: true })
  isAvailable: boolean;
}
