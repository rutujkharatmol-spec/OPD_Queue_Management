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
var QueueGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const socket_io_1 = require("socket.io");
const common_1 = require("@nestjs/common");
let QueueGateway = QueueGateway_1 = class QueueGateway {
    constructor() {
        this.logger = new common_1.Logger(QueueGateway_1.name);
    }
    handleConnection(client) {
        this.logger.log(`Client connected: ${client.id}`);
    }
    handleDisconnect(client) {
        this.logger.log(`Client disconnected: ${client.id}`);
    }
    handleJoinDepartment(client, departmentId) {
        client.join(`department_${departmentId}`);
        this.logger.log(`Client ${client.id} joined department_${departmentId}`);
        return { event: 'joined', data: departmentId };
    }
    handleJoinDoctor(client, doctorId) {
        client.join(`doctor_${doctorId}`);
        this.logger.log(`Client ${client.id} joined doctor_${doctorId}`);
        return { event: 'joined', data: doctorId };
    }
    broadcastQueueUpdate(departmentId, doctorId, queueData) {
        this.server.to(`department_${departmentId}`).emit('queue-update', queueData);
        this.server.to(`doctor_${doctorId}`).emit('queue-update', queueData);
    }
};
exports.QueueGateway = QueueGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], QueueGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('join-department'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, String]),
    __metadata("design:returntype", void 0)
], QueueGateway.prototype, "handleJoinDepartment", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('join-doctor'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, String]),
    __metadata("design:returntype", void 0)
], QueueGateway.prototype, "handleJoinDoctor", null);
exports.QueueGateway = QueueGateway = QueueGateway_1 = __decorate([
    (0, common_1.Injectable)(),
    (0, websockets_1.WebSocketGateway)({
        cors: {
            origin: '*',
        },
    })
], QueueGateway);
//# sourceMappingURL=queue.gateway.js.map