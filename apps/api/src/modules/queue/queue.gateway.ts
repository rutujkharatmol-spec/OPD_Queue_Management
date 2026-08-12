import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*', // In production, restrict to frontend URLs
  },
})
export class QueueGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(QueueGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // Clients (like TV Displays) subscribe to a specific department room
  @SubscribeMessage('join-department')
  handleJoinDepartment(client: Socket, departmentId: string) {
    client.join(`department_${departmentId}`);
    this.logger.log(`Client ${client.id} joined department_${departmentId}`);
    return { event: 'joined', data: departmentId };
  }

  // Clients (like Patients) subscribe to a specific doctor room
  @SubscribeMessage('join-doctor')
  handleJoinDoctor(client: Socket, doctorId: string) {
    client.join(`doctor_${doctorId}`);
    this.logger.log(`Client ${client.id} joined doctor_${doctorId}`);
    return { event: 'joined', data: doctorId };
  }

  // Method to be called by QueueService to broadcast updates
  broadcastQueueUpdate(departmentId: string, doctorId: string, queueData: any) {
    // Notify the entire department TV display
    this.server.to(`department_${departmentId}`).emit('queue-update', queueData);
    
    // Notify specific patients waiting for this doctor
    this.server.to(`doctor_${doctorId}`).emit('queue-update', queueData);
  }
}
