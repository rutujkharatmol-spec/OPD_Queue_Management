import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';

export interface TokenDisplayData {
  department: string;
  doctorName: string;
  roomNumber: string;
  currentToken: string;
  nextTokens: string[];
}

interface QueueStore {
  liveQueues: Record<string, TokenDisplayData>; // key: departmentId
  activeSocket: Socket | null;
  updateQueueData: (departmentId: string, data: TokenDisplayData) => void;
  initializeWebSocket: (departmentId: string) => void;
  disconnectWebSocket: () => void;
}

export const useQueueStore = create<QueueStore>((set, get) => ({
  liveQueues: {},
  activeSocket: null,
  updateQueueData: (departmentId, data) => 
    set((state) => ({
      liveQueues: {
        ...state.liveQueues,
        [departmentId]: data,
      }
    })),
  initializeWebSocket: (departmentId) => {
    // Prevent multiple connections
    const { activeSocket, disconnectWebSocket } = get();
    if (activeSocket) {
      disconnectWebSocket();
    }

    // 1. Connect to the NestJS Gateway
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    const socket = io(API_URL);
    
    // 2. Join the department room
    socket.emit('join-department', departmentId);
    
    // 3. Listen for queue-update events triggered by the backend
    socket.on('queue-update', (data: TokenDisplayData) => {
      console.log('Real-time Queue Update Received:', data);
      get().updateQueueData(departmentId, data);
    });
    
    set({ activeSocket: socket });
  },
  disconnectWebSocket: () => {
    const { activeSocket } = get();
    if (activeSocket) {
      activeSocket.disconnect();
      set({ activeSocket: null });
    }
  }
}));
