import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Token } from './entities/token.entity';
import { Queue } from '../queue/entities/queue.entity';
import { Department } from '../departments/entities/department.entity';
import { TokensService } from './tokens.service';
import { TokensController } from './tokens.controller';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [TypeOrmModule.forFeature([Token, Queue, Department]), QueueModule],
  controllers: [TokensController],
  providers: [TokensService],
  exports: [TokensService],
})
export class TokensModule {}
