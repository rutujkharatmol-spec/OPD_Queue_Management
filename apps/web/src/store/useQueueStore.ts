import { create } from 'zustand';
import { API_BASE_URL } from '../lib/api';

export interface TokenDisplayData {
  department: string;
  activeTokens: { token: string; room: string }[];
  nextTokens: string[];
}

interface QueueStore {
  liveQueues: Record<string, TokenDisplayData>; // key: departmentId
  activeInterval: NodeJS.Timeout | null;
  updateQueueData: (departmentId: string, data: TokenDisplayData) => void;
  initializeWebSocket: (departmentId: string) => void; // Keeping the name to prevent breaking other files
  disconnectWebSocket: () => void;
}

export const useQueueStore = create<QueueStore>((set, get) => ({
  liveQueues: {},
  activeInterval: null,
  updateQueueData: (departmentId, data) => 
    set((state) => ({
      liveQueues: {
        ...state.liveQueues,
        [departmentId]: data,
      }
    })),
  initializeWebSocket: (departmentId) => {
    // Prevent multiple intervals
    const { activeInterval, disconnectWebSocket } = get();
    if (activeInterval) {
      disconnectWebSocket();
    }

    const fetchQueue = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/queue/live/${departmentId}`);
        if (res.ok) {
          const data = await res.json();
          get().updateQueueData(departmentId, data);
        }
      } catch (err) {
        console.error('Failed to fetch queue updates', err);
      }
    };

    // Initial fetch
    fetchQueue();

    // Poll every 3 seconds
    const interval = setInterval(fetchQueue, 3000);
    set({ activeInterval: interval });
  },
  disconnectWebSocket: () => {
    const { activeInterval } = get();
    if (activeInterval) {
      clearInterval(activeInterval);
      set({ activeInterval: null });
    }
  }
}));
