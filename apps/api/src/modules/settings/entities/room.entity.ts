import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../shared/entities/base.entity';

@Entity('rooms')
export class Room extends BaseEntity {
  @Column({ name: 'room_number' })
  roomNumber: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
