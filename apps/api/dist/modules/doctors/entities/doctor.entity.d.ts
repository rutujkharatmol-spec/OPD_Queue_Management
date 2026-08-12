import { BaseEntity } from '../../shared/entities/base.entity';
import { User } from '../../auth/entities/user.entity';
import { Department } from '../../departments/entities/department.entity';
export declare class Doctor extends BaseEntity {
    user: User;
    name: string;
    department: Department;
    specialization: string;
    roomNumber: string;
    isAvailable: boolean;
}
