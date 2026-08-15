import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../shared/entities/base.entity';

export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER',
}

@Entity('patients')
export class Patient extends BaseEntity {
  @Column({ unique: true })
  uhid: string;

  @Column({ name: 'first_name', nullable: true, default: 'Patient' })
  firstName?: string;

  @Column({ name: 'last_name', nullable: true, default: '' })
  lastName?: string;

  @Column({ nullable: true, default: '' })
  phone?: string;

  @Column({ type: 'date', nullable: true })
  dob: Date;

  @Column({
    type: 'enum',
    enum: Gender,
    default: Gender.OTHER,
  })
  gender: Gender;

  @Column({ name: 'created_by', nullable: true })
  createdBy: string;
}
