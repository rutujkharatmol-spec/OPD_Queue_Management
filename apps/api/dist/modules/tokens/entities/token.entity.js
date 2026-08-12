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
exports.Token = exports.TokenPriority = exports.TokenStatus = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../../shared/entities/base.entity");
const patient_entity_1 = require("../../patients/entities/patient.entity");
const doctor_entity_1 = require("../../doctors/entities/doctor.entity");
const department_entity_1 = require("../../departments/entities/department.entity");
var TokenStatus;
(function (TokenStatus) {
    TokenStatus["WAITING"] = "WAITING";
    TokenStatus["CALLED"] = "CALLED";
    TokenStatus["IN_PROGRESS"] = "IN_PROGRESS";
    TokenStatus["COMPLETED"] = "COMPLETED";
    TokenStatus["SKIPPED"] = "SKIPPED";
    TokenStatus["ABSENT"] = "ABSENT";
})(TokenStatus || (exports.TokenStatus = TokenStatus = {}));
var TokenPriority;
(function (TokenPriority) {
    TokenPriority["NORMAL"] = "NORMAL";
    TokenPriority["SENIOR"] = "SENIOR";
    TokenPriority["EMERGENCY"] = "EMERGENCY";
})(TokenPriority || (exports.TokenPriority = TokenPriority = {}));
let Token = class Token extends base_entity_1.BaseEntity {
};
exports.Token = Token;
__decorate([
    (0, typeorm_1.Column)({ name: 'token_number' }),
    __metadata("design:type", String)
], Token.prototype, "tokenNumber", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => patient_entity_1.Patient),
    (0, typeorm_1.JoinColumn)({ name: 'patient_id' }),
    __metadata("design:type", patient_entity_1.Patient)
], Token.prototype, "patient", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => doctor_entity_1.Doctor),
    (0, typeorm_1.JoinColumn)({ name: 'doctor_id' }),
    __metadata("design:type", doctor_entity_1.Doctor)
], Token.prototype, "doctor", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => department_entity_1.Department),
    (0, typeorm_1.JoinColumn)({ name: 'department_id' }),
    __metadata("design:type", department_entity_1.Department)
], Token.prototype, "department", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: TokenStatus,
        default: TokenStatus.WAITING,
    }),
    __metadata("design:type", String)
], Token.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: TokenPriority,
        default: TokenPriority.NORMAL,
    }),
    __metadata("design:type", String)
], Token.prototype, "priority", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'issued_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' }),
    __metadata("design:type", Date)
], Token.prototype, "issuedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'called_at', type: 'timestamp', nullable: true }),
    __metadata("design:type", Date)
], Token.prototype, "calledAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'completed_at', type: 'timestamp', nullable: true }),
    __metadata("design:type", Date)
], Token.prototype, "completedAt", void 0);
exports.Token = Token = __decorate([
    (0, typeorm_1.Entity)('tokens')
], Token);
//# sourceMappingURL=token.entity.js.map