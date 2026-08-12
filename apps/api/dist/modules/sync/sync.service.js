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
var SyncService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const token_entity_1 = require("../tokens/entities/token.entity");
let SyncService = SyncService_1 = class SyncService {
    constructor(localDataSource) {
        this.localDataSource = localDataSource;
        this.logger = new common_1.Logger(SyncService_1.name);
        this.isSyncing = false;
        this.cloudDataSource = null;
    }
    async getCloudConnection() {
        const url = process.env.DATABASE_URL;
        if (!url) {
            return null;
        }
        try {
            if (this.cloudDataSource && this.cloudDataSource.isInitialized) {
                return this.cloudDataSource;
            }
            this.cloudDataSource = new typeorm_2.DataSource({
                type: 'postgres',
                url,
                entities: [token_entity_1.Token],
                synchronize: true,
            });
            await this.cloudDataSource.initialize();
            this.logger.log('Cloud database connected ☁️');
            return this.cloudDataSource;
        }
        catch (error) {
            this.logger.warn(`Cloud DB unavailable (offline mode): ${error.message}`);
            this.cloudDataSource = null;
            return null;
        }
    }
    async handleCron() {
        if (this.isSyncing)
            return;
        this.isSyncing = true;
        try {
            const cloud = await this.getCloudConnection();
            if (!cloud) {
                return;
            }
            const localTokens = await this.localDataSource.getRepository(token_entity_1.Token).find({
                relations: ['patient', 'doctor', 'department'],
            });
            if (localTokens.length === 0) {
                return;
            }
            this.logger.log(`Syncing ${localTokens.length} records to Cloud Database...`);
            const cloudRepo = cloud.getRepository(token_entity_1.Token);
            for (const token of localTokens) {
                const existingToken = await cloudRepo.findOne({ where: { id: token.id } });
                if (existingToken) {
                    await cloudRepo.update(token.id, {
                        status: token.status,
                        calledAt: token.calledAt,
                        completedAt: token.completedAt,
                    });
                }
                else {
                    try {
                        await cloudRepo.save(token);
                    }
                    catch (e) {
                    }
                }
            }
            this.logger.log('Cloud Sync Complete! ☁️✅');
        }
        catch (error) {
            this.logger.warn(`Cloud Sync Failed (Offline Mode Active): ${error.message}`);
            this.cloudDataSource = null;
        }
        finally {
            this.isSyncing = false;
        }
    }
};
exports.SyncService = SyncService;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_10_SECONDS),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SyncService.prototype, "handleCron", null);
exports.SyncService = SyncService = SyncService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectDataSource)()),
    __metadata("design:paramtypes", [typeorm_2.DataSource])
], SyncService);
//# sourceMappingURL=sync.service.js.map