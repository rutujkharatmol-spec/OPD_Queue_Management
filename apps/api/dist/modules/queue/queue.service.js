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
exports.QueueService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const token_entity_1 = require("../tokens/entities/token.entity");
const queue_entity_1 = require("./entities/queue.entity");
const queue_gateway_1 = require("./queue.gateway");
const department_entity_1 = require("../departments/entities/department.entity");
const doctor_entity_1 = require("../doctors/entities/doctor.entity");
const token_entity_2 = require("../tokens/entities/token.entity");
let QueueService = class QueueService {
    constructor(tokenRepository, queueRepository, departmentRepository, dataSource, queueGateway) {
        this.tokenRepository = tokenRepository;
        this.queueRepository = queueRepository;
        this.departmentRepository = departmentRepository;
        this.dataSource = dataSource;
        this.queueGateway = queueGateway;
    }
    async callNextPatient(doctorId) {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();
        try {
            let queue = await queryRunner.manager.findOne(queue_entity_1.Queue, {
                where: { doctor: { id: doctorId } },
                order: { createdAt: 'DESC' },
                relations: ['currentToken', 'doctor', 'doctor.department'],
            });
            if (!queue) {
                let doctor = await queryRunner.manager.findOne(doctor_entity_1.Doctor, { where: { id: doctorId }, relations: ['department'] });
                if (!doctor) {
                    let dept = await queryRunner.manager.findOne(department_entity_1.Department, { where: { name: 'Medicine' } });
                    if (!dept) {
                        dept = queryRunner.manager.create(department_entity_1.Department, { name: 'Medicine', code: 'MED' });
                        await queryRunner.manager.save(dept);
                    }
                    doctor = queryRunner.manager.create(doctor_entity_1.Doctor, {
                        id: doctorId,
                        name: 'Consulting Doctor',
                        roomNumber: '104',
                        department: dept
                    });
                    await queryRunner.manager.save(doctor);
                }
                queue = queryRunner.manager.create(queue_entity_1.Queue, {
                    doctor: { id: doctorId },
                    queueDate: new Date(),
                    status: queue_entity_1.QueueStatus.OPEN,
                });
                await queryRunner.manager.save(queue);
            }
            if (queue.status !== queue_entity_1.QueueStatus.OPEN) {
                throw new common_1.BadRequestException('Queue is not OPEN.');
            }
            if (queue.currentToken && queue.currentToken.status === token_entity_1.TokenStatus.CALLED) {
                queue.currentToken.status = token_entity_1.TokenStatus.COMPLETED;
                queue.currentToken.completedAt = new Date();
                await queryRunner.manager.save(queue.currentToken);
            }
            const nextToken = await queryRunner.manager.findOne(token_entity_1.Token, {
                where: {
                    doctor: { id: doctorId },
                    status: token_entity_1.TokenStatus.WAITING,
                },
                order: {
                    priority: 'DESC',
                    issuedAt: 'ASC',
                },
            });
            if (!nextToken) {
                queue.currentToken = null;
                await queryRunner.manager.save(queue);
                await queryRunner.commitTransaction();
                const emptyDepartmentId = queue.doctor?.department?.id || '660e8400-e29b-41d4-a716-446655440000';
                await this.emitQueueUpdate(emptyDepartmentId, doctorId);
                return null;
            }
            nextToken.status = token_entity_1.TokenStatus.CALLED;
            nextToken.calledAt = new Date();
            await queryRunner.manager.save(nextToken);
            queue.currentToken = nextToken;
            await queryRunner.manager.save(queue);
            await queryRunner.commitTransaction();
            const departmentId = nextToken.department?.id || queue.doctor?.department?.id;
            if (departmentId) {
                await this.emitQueueUpdate(departmentId, doctorId);
            }
            return nextToken;
        }
        catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        }
        finally {
            await queryRunner.release();
        }
    }
    async markTokenAction(tokenId, action) {
        const token = await this.tokenRepository.findOne({ where: { id: tokenId } });
        if (!token)
            throw new common_1.NotFoundException('Token not found');
        if (action === 'SKIP') {
            token.status = token_entity_1.TokenStatus.SKIPPED;
        }
        else if (action === 'ABSENT') {
            token.status = token_entity_1.TokenStatus.ABSENT;
        }
        else if (action === 'COMPLETE') {
            token.status = token_entity_1.TokenStatus.COMPLETED;
            token.completedAt = new Date();
        }
        await this.tokenRepository.save(token);
        const departmentId = token.department?.id || token.doctor?.department?.id;
        if (departmentId) {
            await this.emitQueueUpdate(departmentId, token.doctor.id);
        }
        return token;
    }
    async emitQueueUpdate(departmentId, doctorId) {
        const queueData = await this.buildQueueUpdatePayload(departmentId, doctorId);
        this.queueGateway.broadcastQueueUpdate(departmentId, doctorId, queueData);
    }
    async buildQueueUpdatePayload(departmentId, doctorId) {
        const department = await this.departmentRepository.findOne({ where: { id: departmentId } });
        const queue = await this.queueRepository.findOne({
            where: { doctor: { id: doctorId } },
            order: { createdAt: 'DESC' },
            relations: ['currentToken', 'doctor'],
        });
        const waitingTokens = await this.tokenRepository.find({
            where: {
                doctor: { id: doctorId },
                status: token_entity_1.TokenStatus.WAITING,
            },
            order: {
                priority: 'DESC',
                issuedAt: 'ASC',
            }
        });
        return {
            department: department?.name || 'Department',
            roomNumber: queue?.doctor?.roomNumber || 'TBD',
            currentToken: queue?.currentToken?.tokenNumber || null,
            nextTokens: waitingTokens.map(t => t.priority === token_entity_2.TokenPriority.EMERGENCY ? `${t.tokenNumber} 🚨` : t.tokenNumber)
        };
    }
};
exports.QueueService = QueueService;
exports.QueueService = QueueService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(token_entity_1.Token)),
    __param(1, (0, typeorm_1.InjectRepository)(queue_entity_1.Queue)),
    __param(2, (0, typeorm_1.InjectRepository)(department_entity_1.Department)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.DataSource,
        queue_gateway_1.QueueGateway])
], QueueService);
//# sourceMappingURL=queue.service.js.map