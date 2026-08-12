"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokensService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const token_entity_1 = require("./entities/token.entity");
const patient_entity_1 = require("../patients/entities/patient.entity");
const doctor_entity_1 = require("../doctors/entities/doctor.entity");
const department_entity_1 = require("../departments/entities/department.entity");
const queue_entity_1 = require("../queue/entities/queue.entity");
const queue_service_1 = require("../queue/queue.service");
let TokensService = class TokensService {
    constructor(tokenRepository, queueRepository, departmentRepository, dataSource, queueService) {
        this.tokenRepository = tokenRepository;
        this.queueRepository = queueRepository;
        this.departmentRepository = departmentRepository;
        this.dataSource = dataSource;
        this.queueService = queueService;
    }
    async generateToken(patientId, departmentId, doctorId, priority = token_entity_1.TokenPriority.NORMAL) {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();
        try {
            let department = await queryRunner.manager.findOne(department_entity_1.Department, { where: { id: departmentId } });
            if (!department) {
                department = await queryRunner.manager.findOne(department_entity_1.Department, { where: { code: 'MED' } });
                if (!department) {
                    department = queryRunner.manager.create(department_entity_1.Department, { id: departmentId, name: 'Medicine', code: 'MED' });
                    await queryRunner.manager.save(department);
                }
                else {
                    departmentId = department.id;
                }
            }
            let doctor = await queryRunner.manager.findOne(doctor_entity_1.Doctor, { where: { id: doctorId } });
            if (!doctor) {
                doctor = await queryRunner.manager.findOne(doctor_entity_1.Doctor, { where: { name: 'Consulting Doctor' } });
                if (!doctor) {
                    doctor = queryRunner.manager.create(doctor_entity_1.Doctor, { id: doctorId, name: 'Consulting Doctor', roomNumber: '104', department });
                    await queryRunner.manager.save(doctor);
                }
                else {
                    doctorId = doctor.id;
                }
            }
            let patient = await queryRunner.manager.findOne(patient_entity_1.Patient, { where: { id: patientId } });
            if (!patient) {
                patient = await queryRunner.manager.findOne(patient_entity_1.Patient, { where: { uhid: 'UHID-DEMO-123' } });
                if (!patient) {
                    patient = queryRunner.manager.create(patient_entity_1.Patient, {
                        id: patientId,
                        uhid: 'UHID-DEMO-123',
                        firstName: 'Rahul',
                        lastName: 'Kumar',
                        phone: '9876543210'
                    });
                    await queryRunner.manager.save(patient);
                }
                else {
                    patientId = patient.id;
                }
            }
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date();
            endOfDay.setHours(23, 59, 59, 999);
            const todayTokensCount = await queryRunner.manager.count(token_entity_1.Token, {
                where: {
                    department: { id: departmentId },
                },
            });
            const nextNumber = todayTokensCount + 1;
            const tokenNumber = `${department.code}-${String(nextNumber).padStart(3, '0')}`;
            const token = queryRunner.manager.create(token_entity_1.Token, {
                tokenNumber,
                patient: { id: patientId },
                doctor: { id: doctorId },
                department: { id: departmentId },
                priority,
                status: token_entity_1.TokenStatus.WAITING,
            });
            await queryRunner.manager.save(token);
            await queryRunner.commitTransaction();
            await this.queueService.emitQueueUpdate(departmentId, doctorId);
            return token;
        }
        catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        }
        finally {
            await queryRunner.release();
        }
    }
    async getDoctorQueue(doctorId) {
        return this.tokenRepository.find({
            where: {
                doctor: { id: doctorId },
                status: token_entity_1.TokenStatus.WAITING,
            },
            order: {
                priority: 'DESC',
                issuedAt: 'ASC',
            },
            relations: ['patient'],
        });
    }
};
exports.TokensService = TokensService;
exports.TokensService = TokensService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(token_entity_1.Token)),
    __param(1, (0, typeorm_1.InjectRepository)(queue_entity_1.Queue)),
    __param(2, (0, typeorm_1.InjectRepository)(department_entity_1.Department)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.DataSource,
        queue_service_1.QueueService])
], TokensService);
//# sourceMappingURL=tokens.service.js.map