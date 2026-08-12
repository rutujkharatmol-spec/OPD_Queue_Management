"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const queue_entity_1 = require("./entities/queue.entity");
const token_entity_1 = require("../tokens/entities/token.entity");
const department_entity_1 = require("../departments/entities/department.entity");
const queue_service_1 = require("./queue.service");
const queue_controller_1 = require("./queue.controller");
const queue_gateway_1 = require("./queue.gateway");
let QueueModule = class QueueModule {
};
exports.QueueModule = QueueModule;
exports.QueueModule = QueueModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([queue_entity_1.Queue, token_entity_1.Token, department_entity_1.Department])],
        controllers: [queue_controller_1.QueueController],
        providers: [queue_service_1.QueueService, queue_gateway_1.QueueGateway],
        exports: [queue_service_1.QueueService, queue_gateway_1.QueueGateway],
    })
], QueueModule);
//# sourceMappingURL=queue.module.js.map