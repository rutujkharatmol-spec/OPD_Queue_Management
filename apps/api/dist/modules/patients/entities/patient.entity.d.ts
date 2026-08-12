import { BaseEntity } from '../../shared/entities/base.entity';
export declare enum Gender {
    MALE = "MALE",
    FEMALE = "FEMALE",
    OTHER = "OTHER"
}
export declare class Patient extends BaseEntity {
    uhid: string;
    firstName: string;
    lastName: string;
    phone: string;
    dob: Date;
    gender: Gender;
    createdBy: string;
}
