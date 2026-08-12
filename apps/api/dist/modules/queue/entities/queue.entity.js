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
Object.defineProperty(exports, "__esModule", { value: true });
exports.Queue = exports.QueueStatus = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../../shared/entities/base.entity");
const doctor_entity_1 = require("../../doctors/entities/doctor.entity");
const token_entity_1 = require("../../tokens/entities/token.entity");
var QueueStatus;
(function (QueueStatus) {
    QueueStatus["OPEN"] = "OPEN";
    QueueStatus["PAUSED"] = "PAUSED";
    QueueStatus["CLOSED"] = "CLOSED";
})(QueueStatus || (exports.QueueStatus = QueueStatus = {}));
let Queue = class Queue extends base_entity_1.BaseEntity {
};
exports.Queue = Queue;
__decorate([
    (0, typeorm_1.ManyToOne)(() => doctor_entity_1.Doctor),
    (0, typeorm_1.JoinColumn)({ name: 'doctor_id' }),
    __metadata("design:type", doctor_entity_1.Doctor)
], Queue.prototype, "doctor", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'queue_date', type: 'date' }),
    __metadata("design:type", Date)
], Queue.prototype, "queueDate", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: QueueStatus,
        default: QueueStatus.OPEN,
    }),
    __metadata("design:type", String)
], Queue.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.OneToOne)(() => token_entity_1.Token, { nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'current_token_id' }),
    __metadata("design:type", token_entity_1.Token)
], Queue.prototype, "currentToken", void 0);
exports.Queue = Queue = __decorate([
    (0, typeorm_1.Entity)('queues')
], Queue);
//# sourceMappingURL=queue.entity.js.map