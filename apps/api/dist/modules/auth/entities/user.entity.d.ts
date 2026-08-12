import { BaseEntity } from '../../shared/entities/base.entity';
export declare enum UserRole {
    SUPER_ADMIN = "SUPER_ADMIN",
    ADMIN = "ADMIN",
    STAFF = "STAFF",
    DOCTOR = "DOCTOR"
}
export declare class User extends BaseEntity {
    email: string;
    passwordHash: string;
    role: UserRole;
    isActive: boolean;
}
