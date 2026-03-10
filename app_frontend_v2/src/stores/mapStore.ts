import { create } from 'zustand';
import type { LatLng } from '../types';

interface MapState {
  // 地图中心
  center: LatLng;
  zoom: number;

  // 起点和终点
  from: LatLng | null;
  to: LatLng | null;

  // 选择模式
  selecting: 'from' | 'to' | null;

  // 绘制模式
  drawing: boolean;
  drawPoints: LatLng[];

  // 预览图层
  previewPolygon: LatLng[] | null;
  previewArcs: Array<{ u: [number, number]; v: [number, number] }> | null;

  // Actions
  setCenter: (center: LatLng) => void;
  setZoom: (zoom: number) => void;
  setFrom: (from: LatLng | null) => void;
  setTo: (to: LatLng | null) => void;
  setSelecting: (selecting: 'from' | 'to' | null) => void;
  setDrawing: (drawing: boolean) => void;
  addDrawPoint: (point: LatLng) => void;
  clearDrawPoints: () => void;
  setPreviewPolygon: (polygon: LatLng[] | null) => void;
  setPreviewArcs: (arcs: Array<{ u: [number, number]; v: [number, number] }> | null) => void;
  clearAll: () => void;
}

export const useMapStore = create<MapState>((set) => ({
  // 初始状态 - 上海
  center: { lat: 31.2304, lon: 121.4737 },
  zoom: 12,

  from: { lat: 31.2335, lon: 121.475 },
  to: { lat: 31.24, lon: 121.4998 },

  selecting: 'from',
  drawing: false,
  drawPoints: [],

  previewPolygon: null,
  previewArcs: null,

  setCenter: (center) => set({ center }),
  setZoom: (zoom) => set({ zoom }),

  setFrom: (from) => set({ from }),
  setTo: (to) => set({ to }),

  setSelecting: (selecting) => set({ selecting }),

  setDrawing: (drawing) => set({ drawing }),

  addDrawPoint: (point) =>
    set((state) => ({
      drawPoints: [...state.drawPoints, point],
    })),

  clearDrawPoints: () => set({ drawPoints: [], previewPolygon: null, previewArcs: null }),

  setPreviewPolygon: (previewPolygon) => set({ previewPolygon }),

  setPreviewArcs: (previewArcs) => set({ previewArcs }),

  clearAll: () =>
    set({
      from: null,
      to: null,
      selecting: 'from',
      drawPoints: [],
      previewPolygon: null,
      previewArcs: null,
    }),
}));
