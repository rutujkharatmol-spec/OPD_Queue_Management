import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Room } from './entities/room.entity';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(Room)
    private readonly roomRepository: Repository<Room>,
  ) {}

  async findAllRooms(): Promise<Room[]> {
    return this.roomRepository.find({ order: { roomNumber: 'ASC' } });
  }

  async createRoom(roomNumber: string, isActive: boolean = true): Promise<Room> {
    const room = this.roomRepository.create({ roomNumber, isActive });
    return this.roomRepository.save(room);
  }

  async updateRoom(id: string, roomNumber: string, isActive: boolean): Promise<Room> {
    const room = await this.roomRepository.findOne({ where: { id } });
    if (!room) throw new NotFoundException('Room not found');
    
    if (roomNumber !== undefined) room.roomNumber = roomNumber;
    if (isActive !== undefined) room.isActive = isActive;
    
    return this.roomRepository.save(room);
  }

  async deleteRoom(id: string): Promise<void> {
    const result = await this.roomRepository.delete(id);
    if (result.affected === 0) throw new NotFoundException('Room not found');
  }
}
