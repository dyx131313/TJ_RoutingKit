import { useCallback, useEffect } from 'react';
import { useTemplateStore } from '../stores';
import {
  getTemplates,
  createTemplate,
  deleteTemplate,
  getTemplatePreview,
  getErrorMessage,
} from '../services/api';
import type { TemplateType } from '../types';

export function useTemplates() {
  const {
    templates,
    templateType,
    arcIdsInput,
    tagKey,
    tagValue,
    selectedSignatures,
    previewingSignature,
    previewData,
    loading,
    error,
    setTemplates,
    setTemplateType,
    setArcIdsInput,
    setTagKey,
    setTagValue,
    setPreviewing,
    setLoading,
    setError,
  } = useTemplateStore();

  // 加载模板列表
  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTemplates();
      setTemplates(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [setTemplates, setLoading, setError]);

  // 保存模板
  const saveTemplate = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      let payload: {
        type: TemplateType;
        polygon?: number[][];
        arc_ids?: string;
        tag_filter?: { key: string; value: string };
      } = { type: templateType };

      if (templateType === 'polygon') {
        // 从 mapStore 获取 drawPoints
        // 这里简化处理，由调用方传入
      } else if (templateType === 'arc_ids') {
        payload.arc_ids = arcIdsInput;
      } else if (templateType === 'tag_filter') {
        payload.tag_filter = { key: tagKey, value: tagValue };
      }

      await createTemplate(payload);
      await loadTemplates();
    } catch (err) {
      setError(getErrorMessage(err));
      setLoading(false);
    }
  }, [templateType, arcIdsInput, tagKey, tagValue, loadTemplates, setLoading, setError]);

  // 删除模板
  const removeTemplate = useCallback(async (signature: string) => {
    setLoading(true);
    setError(null);
    try {
      await deleteTemplate(signature);
      setTemplates(templates.filter((t) => t.signature !== signature));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [templates, setTemplates, setLoading, setError]);

  // 预览模板
  const previewTemplate = useCallback(async (signature: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTemplatePreview(signature);
      setPreviewing(signature, data);
    } catch (err) {
      setError(getErrorMessage(err));
      setPreviewing(signature, null);
    } finally {
      setLoading(false);
    }
  }, [setPreviewing, setLoading, setError]);

  // 关闭预览
  const closePreview = useCallback(() => {
    setPreviewing(null, null);
  }, [setPreviewing]);

  // 自动加载
  useEffect(() => {
    loadTemplates();
  }, []);

  return {
    templates,
    templateType,
    arcIdsInput,
    tagKey,
    tagValue,
    selectedSignatures,
    previewingSignature,
    previewData,
    loading,
    error,
    setTemplateType,
    setArcIdsInput,
    setTagKey,
    setTagValue,
    loadTemplates,
    saveTemplate,
    removeTemplate,
    previewTemplate,
    closePreview,
  };
}
