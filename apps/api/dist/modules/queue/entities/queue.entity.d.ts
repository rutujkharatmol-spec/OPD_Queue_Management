import { BaseEntity } from '../../shared/entities/base.entity';
import { Doctor } from '../../doctors/entities/doctor.entity';
import { Token } from '../../tokens/entities/token.entity';
export declare enum QueueStatus {
    OPEN = "OPEN",
    PAUSED = "PAUSED",
    CLOSED = "CLOSED"
}
export declare class Queue extends BaseEntity {
    doctor: Doctor;
    queueDate: Date;
    status: QueueStatus;
    currentToken: Token;
}
