import { TokenPriority } from '../entities/token.entity';
export declare class GenerateTokenDto {
    patientId: string;
    departmentId: string;
    doctorId: string;
    priority?: TokenPriority;
}
