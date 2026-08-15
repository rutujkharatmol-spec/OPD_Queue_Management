import { create } from 'zustand';
import { API_BASE_URL } from '../lib/api';
import { fetchWithOfflineSync } from '../lib/offlineSync';

export interface TokenDisplayData {
  department: string;
  activeTokens: {
    id: string;
    token: string;
    room: string;
    patientName: string;
    uhid: string;
    doctorName?: string;
    calledAt?: number;
    recalledAt?: number;
  }[];
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
        const res = await fetchWithOfflineSync(`${API_BASE_URL}/queue/live/${departmentId}`);
        if (res.ok) {
          const data = await res.json();
          if (data && (data.activeTokens || data.nextTokens)) {
            get().updateQueueData(departmentId, data);
          }
        }
      } catch (err) {
        // Only log if it's not a generic network error to prevent console spam when server is restarting
        if (err instanceof Error && err.name !== 'TypeError') {
          console.error(`Failed to fetch queue updates from ${API_BASE_URL}/queue/live/${departmentId}`, err);
        }
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
