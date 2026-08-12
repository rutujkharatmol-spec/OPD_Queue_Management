"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const schedule_1 = require("@nestjs/schedule");
const queue_module_1 = require("./modules/queue/queue.module");
const tokens_module_1 = require("./modules/tokens/tokens.module");
const queue_entity_1 = require("./modules/queue/entities/queue.entity");
const token_entity_1 = require("./modules/tokens/entities/token.entity");
const department_entity_1 = require("./modules/departments/entities/department.entity");
const doctor_entity_1 = require("./modules/doctors/entities/doctor.entity");
const patient_entity_1 = require("./modules/patients/entities/patient.entity");
const user_entity_1 = require("./modules/auth/entities/user.entity");
const audit_log_entity_1 = require("./modules/audit/entities/audit-log.entity");
const fs = require("fs");
const path = require("path");
try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
        const envFile = fs.readFileSync(envPath, 'utf8');
        envFile.split('\n').forEach(line => {
            const parts = line.split('=');
            if (parts.length >= 2) {
                const key = parts[0].trim();
                const value = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
                if (key && !process.env[key]) {
                    process.env[key] = value;
                }
            }
        });
    }
}
catch (e) { }
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forRoot({
                type: 'postgres',
                url: process.env.DATABASE_URL,
                autoLoadEntities: true,
                entities: [queue_entity_1.Queue, token_entity_1.Token, department_entity_1.Department, doctor_entity_1.Doctor, patient_entity_1.Patient, user_entity_1.User, audit_log_entity_1.AuditLog],
                synchronize: true,
            }),
            schedule_1.ScheduleModule.forRoot(),
            queue_module_1.QueueModule,
            tokens_module_1.TokensModule,
        ],
        controllers: [],
        providers: [],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map