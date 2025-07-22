import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SecurityTestState {
  dangerMode: boolean;
}

interface SecurityTestActions {
  setDangerMode: (enabled: boolean) => void;
}

type SecurityTestStore = SecurityTestState & SecurityTestActions;

const STORAGE_KEY = 'archestra-security-test';

export const useSecurityTestStore = create<SecurityTestStore>()(
  persist(
    (set) => ({
      dangerMode: false,
      setDangerMode: (enabled) => set({ dangerMode: enabled }),
    }),
    {
      name: STORAGE_KEY,
    }
  )
);
