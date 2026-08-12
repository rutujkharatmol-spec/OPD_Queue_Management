import { BaseEntity } from '../../shared/entities/base.entity';
import { Patient } from '../../patients/entities/patient.entity';
import { Doctor } from '../../doctors/entities/doctor.entity';
import { Department } from '../../departments/entities/department.entity';
export declare enum TokenStatus {
    WAITING = "WAITING",
    CALLED = "CALLED",
    IN_PROGRESS = "IN_PROGRESS",
    COMPLETED = "COMPLETED",
    SKIPPED = "SKIPPED",
    ABSENT = "ABSENT"
}
export declare enum TokenPriority {
    NORMAL = "NORMAL",
    SENIOR = "SENIOR",
    EMERGENCY = "EMERGENCY"
}
export declare class Token extends BaseEntity {
    tokenNumber: string;
    patient: Patient;
    doctor: Doctor;
    department: Department;
    status: TokenStatus;
    priority: TokenPriority;
    issuedAt: Date;
    calledAt: Date;
    completedAt: Date;
}
