import { Column, Entity, JoinColumn, ManyToOne, OneToOne } from 'typeorm';
import { BaseEntity } from '../../shared/entities/base.entity';
import { Doctor } from '../../doctors/entities/doctor.entity';
import { Token } from '../../tokens/entities/token.entity';

export enum QueueStatus {
  OPEN = 'OPEN',
  PAUSED = 'PAUSED',
  CLOSED = 'CLOSED',
}

@Entity('queues')
export class Queue extends BaseEntity {
  @ManyToOne(() => Doctor)
  @JoinColumn({ name: 'doctor_id' })
  doctor: Doctor;

  @Column({ name: 'queue_date', type: 'date' })
  queueDate: Date;

  @Column({
    type: 'enum',
    enum: QueueStatus,
    default: QueueStatus.OPEN,
  })
  status: QueueStatus;

  @OneToOne(() => Token, { nullable: true })
  @JoinColumn({ name: 'current_token_id' })
  currentToken: Token;
}
