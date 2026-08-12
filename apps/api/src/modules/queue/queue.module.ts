import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Queue } from './entities/queue.entity';
import { Token } from '../tokens/entities/token.entity';
import { Department } from '../departments/entities/department.entity';
import { QueueService } from './queue.service';
import { QueueController } from './queue.controller';


@Module({
  imports: [TypeOrmModule.forFeature([Queue, Token, Department])],
  controllers: [QueueController],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
