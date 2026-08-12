import { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
export declare class QueueGateway implements OnGatewayConnection, OnGatewayDisconnect {
    server: Server;
    private readonly logger;
    handleConnection(client: Socket): void;
    handleDisconnect(client: Socket): void;
    handleJoinDepartment(client: Socket, departmentId: string): {
        event: string;
        data: string;
    };
    handleJoinDoctor(client: Socket, doctorId: string): {
        event: string;
        data: string;
    };
    broadcastQueueUpdate(departmentId: string, doctorId: string, queueData: any): void;
}
