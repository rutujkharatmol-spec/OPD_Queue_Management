import { BaseEntity } from '../../shared/entities/base.entity';
import { Doctor } from '../../doctors/entities/doctor.entity';
export declare class Department extends BaseEntity {
    name: string;
    code: string;
    description: string;
    isActive: boolean;
    doctors: Doctor[];
}
