import { Repository, DataSource } from 'typeorm';
import { Token } from '../tokens/entities/token.entity';
import { Queue } from './entities/queue.entity';
import { QueueGateway } from './queue.gateway';
import { Department } from '../departments/entities/department.entity';
export declare class QueueService {
    private readonly tokenRepository;
    private readonly queueRepository;
    private readonly departmentRepository;
    private readonly dataSource;
    private readonly queueGateway;
    constructor(tokenRepository: Repository<Token>, queueRepository: Repository<Queue>, departmentRepository: Repository<Department>, dataSource: DataSource, queueGateway: QueueGateway);
    callNextPatient(doctorId: string): Promise<Token>;
    markTokenAction(tokenId: string, action: 'SKIP' | 'ABSENT' | 'COMPLETE'): Promise<Token>;
    emitQueueUpdate(departmentId: string, doctorId: string): Promise<void>;
    private buildQueueUpdatePayload;
}
