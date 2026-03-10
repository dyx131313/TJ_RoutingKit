import { create } from 'zustand';
import type { Template, TemplateType, ResolvePolyResult } from '../types';

interface TemplateState {
  // 模板列表
  templates: Template[];

  // 选中的模板（用于创建规则）
  selectedSignatures: Set<string>;

  // 当前预览的模板
  previewingSignature: string | null;
  previewData: ResolvePolyResult | null;

  // 模板类型选择
  templateType: TemplateType;

  // 输入值
  arcIdsInput: string;
  tagKey: string;
  tagValue: string;

  // 面板显示
  panelVisible: boolean;

  // 加载状态
  loading: boolean;
  error: string | null;

  // Actions
  setTemplates: (templates: Template[]) => void;
  addTemplate: (template: Template) => void;
  removeTemplate: (signature: string) => void;
  toggleSelected: (signature: string) => void;
  clearSelected: () => void;
  setPreviewing: (signature: string | null, data: ResolvePolyResult | null) => void;
  setTemplateType: (type: TemplateType) => void;
  setArcIdsInput: (value: string) => void;
  setTagKey: (value: string) => void;
  setTagValue: (value: string) => void;
  setPanelVisible: (visible: boolean) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useTemplateStore = create<TemplateState>((set) => ({
  templates: [],
  selectedSignatures: new Set(),
  previewingSignature: null,
  previewData: null,
  templateType: 'polygon',
  arcIdsInput: '',
  tagKey: '',
  tagValue: '',
  panelVisible: false,
  loading: false,
  error: null,

  setTemplates: (templates) => set({ templates }),

  addTemplate: (template) =>
    set((state) => ({
      templates: [...state.templates, template],
    })),

  removeTemplate: (signature) =>
    set((state) => ({
      templates: state.templates.filter((t) => t.signature !== signature),
      selectedSignatures: new Set(
        [...state.selectedSignatures].filter((s) => s !== signature)
      ),
    })),

  toggleSelected: (signature) =>
    set((state) => {
      const newSet = new Set(state.selectedSignatures);
      if (newSet.has(signature)) {
        newSet.delete(signature);
      } else {
        newSet.add(signature);
      }
      return { selectedSignatures: newSet };
    }),

  clearSelected: () => set({ selectedSignatures: new Set() }),

  setPreviewing: (signature, data) =>
    set({ previewingSignature: signature, previewData: data }),

  setTemplateType: (templateType) => set({ templateType }),

  setArcIdsInput: (arcIdsInput) => set({ arcIdsInput }),
  setTagKey: (tagKey) => set({ tagKey }),
  setTagValue: (tagValue) => set({ tagValue }),

  setPanelVisible: (panelVisible) => set({ panelVisible }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));
