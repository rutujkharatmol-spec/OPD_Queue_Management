import { BaseEntity } from '../../shared/entities/base.entity';
import { User } from '../../auth/entities/user.entity';
export declare class AuditLog extends BaseEntity {
    user: User;
    action: string;
    entityType: string;
    entityId: string;
    oldData: any;
    newData: any;
    ipAddress: string;
}
