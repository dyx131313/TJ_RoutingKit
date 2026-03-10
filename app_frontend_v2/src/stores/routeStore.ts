import { create } from 'zustand';
import type { Profile, RouteResult } from '../types';

interface RouteState {
  // 当前配置
  profile: Profile;
  ruleId: string;

  // 路由结果
  routeResult: RouteResult | null;
  routeCoords: [number, number][] | null;

  // 加载状态
  loading: boolean;
  error: string | null;

  // Actions
  setProfile: (profile: Profile) => void;
  setRuleId: (ruleId: string) => void;
  setRouteResult: (result: RouteResult | null) => void;
  setRouteCoords: (coords: [number, number][] | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearRoute: () => void;
}

export const useRouteStore = create<RouteState>((set) => ({
  profile: 'normal',
  ruleId: '',

  routeResult: null,
  routeCoords: null,

  loading: false,
  error: null,

  setProfile: (profile) => set({ profile }),
  setRuleId: (ruleId) => set({ ruleId }),

  setRouteResult: (routeResult) => set({ routeResult }),
  setRouteCoords: (routeCoords) => set({ routeCoords }),

  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  clearRoute: () =>
    set({
      routeResult: null,
      routeCoords: null,
      error: null,
    }),
}));
