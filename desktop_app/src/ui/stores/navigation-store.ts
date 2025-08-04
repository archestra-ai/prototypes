import { create } from 'zustand';

import { NavigationSubViewKey, NavigationViewKey } from '@types';

interface NavigationState {
  activeView: NavigationViewKey;
  activeSubView: NavigationSubViewKey;
}

interface NavigationActions {
  setActiveView: (view: NavigationViewKey) => void;
  setActiveSubView: (subView: NavigationSubViewKey) => void;
}

type NavigationStore = NavigationState & NavigationActions;

export const useNavigationStore = create<NavigationStore>((set, _get) => ({
  // State
  activeView: NavigationViewKey.Chat,
  activeSubView: NavigationSubViewKey.Ollama,
  // Actions
  setActiveView: (view) => set({ activeView: view }),
  setActiveSubView: (subView) => set({ activeSubView: subView }),
}));
