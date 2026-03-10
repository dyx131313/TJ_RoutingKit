import { useCallback, useEffect } from 'react';
import { useRuleStore, useTemplateStore } from '../stores';
import {
  getRules,
  createRule,
  deleteRule,
  buildRuleMetric,
  getErrorMessage,
} from '../services/api';

export function useRules() {
  const {
    rules,
    loading,
    error,
    setRules,
    addRule,
    removeRule,
    setLoading,
    setError,
  } = useRuleStore();

  const { selectedSignatures } = useTemplateStore();

  // 加载规则列表
  const loadRules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getRules();
      setRules(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [setRules, setLoading, setError]);

  // 创建规则
  const addNewRule = useCallback(async (name: string, description?: string) => {
    setLoading(true);
    setError(null);
    try {
      const rule = await createRule({
        name,
        description,
        templates: Array.from(selectedSignatures),
      });
      addRule(rule);
      return rule;
    } catch (err) {
      setError(getErrorMessage(err));
      return null;
    } finally {
      setLoading(false);
    }
  }, [selectedSignatures, addRule, setLoading, setError]);

  // 删除规则
  const remove = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      await deleteRule(id);
      removeRule(id);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [removeRule, setLoading, setError]);

  // 构建规则 metric
  const buildMetric = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      await buildRuleMetric(id);
      await loadRules(); // 刷新列表
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [loadRules, setLoading, setError]);

  // 自动加载
  useEffect(() => {
    loadRules();
  }, []);

  return {
    rules,
    loading,
    error,
    loadRules,
    addNewRule,
    remove,
    buildMetric,
  };
}
