import { create } from 'zustand';
import type { Rule } from '../types';

interface RuleState {
  // 规则列表
  rules: Rule[];

  // 当前编辑的规则
  currentRule: Rule | null;

  // 面板显示
  panelVisible: boolean;

  // 加载状态
  loading: boolean;
  error: string | null;

  // Actions
  setRules: (rules: Rule[]) => void;
  addRule: (rule: Rule) => void;
  updateRule: (id: string, rule: Partial<Rule>) => void;
  removeRule: (id: string) => void;
  setCurrentRule: (rule: Rule | null) => void;
  setPanelVisible: (visible: boolean) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useRuleStore = create<RuleState>((set) => ({
  rules: [],
  currentRule: null,
  panelVisible: false,
  loading: false,
  error: null,

  setRules: (rules) => set({ rules }),

  addRule: (rule) =>
    set((state) => ({
      rules: [...state.rules, rule],
    })),

  updateRule: (id, updatedFields) =>
    set((state) => ({
      rules: state.rules.map((r) =>
        r.id === id ? { ...r, ...updatedFields } : r
      ),
    })),

  removeRule: (id) =>
    set((state) => ({
      rules: state.rules.filter((r) => r.id !== id),
    })),

  setCurrentRule: (currentRule) => set({ currentRule }),
  setPanelVisible: (panelVisible) => set({ panelVisible }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));
