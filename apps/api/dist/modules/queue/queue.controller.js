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
exports.QueueController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const queue_service_1 = require("./queue.service");
const mark_token_action_dto_1 = require("./dto/mark-token-action.dto");
let QueueController = class QueueController {
    constructor(queueService) {
        this.queueService = queueService;
    }
    async callNextPatient(doctorId) {
        return this.queueService.callNextPatient(doctorId);
    }
    async markTokenAction(tokenId, dto) {
        return this.queueService.markTokenAction(tokenId, dto.action);
    }
};
exports.QueueController = QueueController;
__decorate([
    (0, common_1.Patch)('next/:doctorId'),
    (0, swagger_1.ApiOperation)({ summary: 'Call the next patient in the queue for a doctor' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Returns the called token or null if queue is empty.' }),
    __param(0, (0, common_1.Param)('doctorId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], QueueController.prototype, "callNextPatient", null);
__decorate([
    (0, common_1.Patch)('action/:tokenId'),
    (0, swagger_1.ApiOperation)({ summary: 'Mark a token action (SKIP, ABSENT, COMPLETE)' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'The token action has been recorded.' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Token not found.' }),
    __param(0, (0, common_1.Param)('tokenId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, mark_token_action_dto_1.MarkTokenActionDto]),
    __metadata("design:returntype", Promise)
], QueueController.prototype, "markTokenAction", null);
exports.QueueController = QueueController = __decorate([
    (0, swagger_1.ApiTags)('Queue'),
    (0, common_1.Controller)('queue'),
    __metadata("design:paramtypes", [queue_service_1.QueueService])
], QueueController);
//# sourceMappingURL=queue.controller.js.map