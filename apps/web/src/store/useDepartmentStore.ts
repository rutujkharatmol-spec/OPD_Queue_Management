// src/store/useDepartmentStore.ts
import { create } from 'zustand';
import { getDepartments } from '../lib/api';

export interface Department {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  isActive?: boolean;
}

interface DepartmentStore {
  selectedDeptId: string;
  departments: Department[];
  isLoaded: boolean;
  setSelectedDeptId: (id: string) => void;
  loadDepartments: (urlDeptId?: string | null) => Promise<Department[]>;
  setDepartments: (depts: Department[]) => void;
  getEffectiveDeptId: (urlDeptId?: string | null) => string;
}

const STORAGE_KEY = 'opd_selected_department_id';

/**
 * Signature of the department list currently in the store.
 *
 * Kept at module scope so it is never itself a subscribable value, exactly as
 * `useQueueStore` keeps its payload signatures.
 */
let lastDepartmentSignature = '';

/** Cheaper than `JSON.stringify` and covers every field any screen renders. */
function departmentSignature(depts: Department[]): string {
  let signature = '';
  for (const d of depts) {
    signature += `${d.id}|${d.name}|${d.code}|${d.description ?? ''}|${d.isActive ?? ''}`;
  }
  return signature;
}

export const useDepartmentStore = create<DepartmentStore>((set, get) => ({
  selectedDeptId: typeof window !== 'undefined' ? (localStorage.getItem(STORAGE_KEY) || '') : '',
  departments: [],
  isLoaded: false,
  setSelectedDeptId: (id: string) => {
    if (!id) return;
    // Re-selecting the department already in effect is a no-op. Every screen calls
    // `loadDepartments` on mount, which lands here, so without this a navigation wrote
    // localStorage, dispatched an event and pushed a store update — waking every
    // subscriber — to store the value that was already there.
    if (id === get().selectedDeptId) return;
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, id);
      window.dispatchEvent(new CustomEvent('opd-dept-changed', { detail: { departmentId: id } }));
    }
    set({ selectedDeptId: id });
  },
  setDepartments: (depts: Department[]) => {
    set({ departments: depts });
  },
  getEffectiveDeptId: (urlDeptId?: string | null) => {
    const { selectedDeptId, departments } = get();
    if (urlDeptId && (!departments.length || departments.some(d => d.id === urlDeptId))) {
      return urlDeptId;
    }
    if (selectedDeptId && (!departments.length || departments.some(d => d.id === selectedDeptId))) {
      return selectedDeptId;
    }
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return stored;
    }
    return departments[0]?.id || '660e8400-e29b-41d4-a716-446655440000';
  },
  loadDepartments: async (urlDeptId?: string | null) => {
    try {
      const depts = await getDepartments();

      // Storing an equal-but-new array would hand every subscriber a changed reference
      // and re-render the navbar, the dashboard and the board. Departments change when
      // an admin edits them, not on the several `loadDepartments` calls each page
      // mount fires, so compare before publishing. `getDepartments` returns freshly
      // parsed JSON, so a shallow field compare is enough — and it is the same trick
      // `useQueueStore` uses for the live queue.
      const signature = departmentSignature(depts);
      if (signature !== lastDepartmentSignature || !get().isLoaded) {
        lastDepartmentSignature = signature;
        set({ departments: depts, isLoaded: true });
      }

      const currentStored = typeof window !== 'undefined' ? (localStorage.getItem(STORAGE_KEY) || '') : '';
      let targetId = '';

      if (urlDeptId && depts.some(d => d.id === urlDeptId)) {
        targetId = urlDeptId;
      } else if (currentStored && depts.some(d => d.id === currentStored)) {
        targetId = currentStored;
      } else if (depts.length > 0) {
        targetId = depts[0].id;
      }

      if (targetId) {
        get().setSelectedDeptId(targetId);
      }
      return depts;
    } catch {
      return [];
    }
  }
}));
