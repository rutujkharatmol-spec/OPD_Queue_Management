import { Repository, DataSource } from 'typeorm';
import { Token, TokenPriority } from './entities/token.entity';
import { Department } from '../departments/entities/department.entity';
import { Queue } from '../queue/entities/queue.entity';
import { QueueService } from '../queue/queue.service';
export declare class TokensService {
    private readonly tokenRepository;
    private readonly queueRepository;
    private readonly departmentRepository;
    private readonly dataSource;
    private readonly queueService;
    constructor(tokenRepository: Repository<Token>, queueRepository: Repository<Queue>, departmentRepository: Repository<Department>, dataSource: DataSource, queueService: QueueService);
    generateToken(patientId: string, departmentId: string, doctorId: string, priority?: TokenPriority): Promise<Token>;
    getDoctorQueue(doctorId: string): Promise<Token[]>;
}
