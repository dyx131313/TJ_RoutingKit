import axios, { AxiosError } from 'axios';
import type {
  RouteResult,
  Template,
  Rule,
  ResolvePolyResult,
  ServiceInfo,
  NearestResult,
  Profile,
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

// 路由查询
export async function queryRoute(
  from: string,
  to: string,
  profile: Profile = 'normal',
  metricSig?: string,
  ruleId?: string
): Promise<RouteResult> {
  const params = new URLSearchParams({
    from,
    to,
    profile,
  });

  if (metricSig) {
    params.append('metric_sig', metricSig);
  }
  if (ruleId) {
    params.append('rule_id', ruleId);
  }

  const response = await api.get<RouteResult>(`/route?${params}`);
  return response.data;
}

// 最近节点查询
export async function queryNearest(lat: number, lon: number): Promise<NearestResult> {
  const response = await api.get<NearestResult>(`/nearest?lat=${lat}&lon=${lon}`);
  return response.data;
}

// 获取服务信息
export async function getServiceInfo(): Promise<ServiceInfo> {
  const response = await api.get<ServiceInfo>('/health');
  // 健康检查返回的是字符串，需要特殊处理
  if (typeof response.data === 'string') {
    return {
      node_count: 0,
      arc_count: 0,
      travel_time_count: 0,
    };
  }
  return response.data;
}

// ============ 模板相关 API ============

// 获取模板列表
export async function getTemplates(): Promise<Template[]> {
  const response = await api.get<{ templates: any[] }>('/api/templates');
  // 转换返回数据为 Template 格式
  return response.data.templates.map(t => ({
    signature: t.signature,
    type: t.type || 'polygon',
    canonical: t.canonical || {},
    original: t.original || {},
    created_at: t.created_at,
  }));
}

// 创建模板
export async function createTemplate(data: {
  type: 'polygon' | 'arc_ids' | 'tag_filter';
  polygon?: number[][];
  arc_ids?: string;
  tag_filter?: { key: string; value: string };
}): Promise<{ signature: string }> {
  const response = await api.post<{ signature: string }>('/api/templates', data);
  return response.data;
}

// 获取模板详情
export async function getTemplate(signature: string): Promise<Template> {
  const response = await api.get<Template>(`/api/templates/${signature}`);
  return response.data;
}

// 删除模板
export async function deleteTemplate(signature: string): Promise<void> {
  await api.delete(`/api/templates/${signature}`);
}

// 获取模板预览
export async function getTemplatePreview(signature: string): Promise<ResolvePolyResult> {
  const response = await api.get<ResolvePolyResult>(`/api/templates/${signature}/preview`);
  return response.data;
}

// 预计算模板
export async function precomputeTemplate(signature: string): Promise<void> {
  await api.post(`/api/templates/${signature}/precompute`);
}

// 构建模板 metric
export async function buildTemplateMetric(signature: string): Promise<void> {
  await api.post(`/api/templates/${signature}/build`);
}

// ============ 规则相关 API ============

// 获取规则列表
export async function getRules(): Promise<Rule[]> {
  const response = await api.get<{ rules: Rule[] }>('/api/rules');
  return response.data.rules;
}

// 创建规则
export async function createRule(data: {
  name: string;
  description?: string;
  templates: string[];
}): Promise<Rule> {
  const response = await api.post<Rule>('/api/rules', data);
  return response.data;
}

// 获取规则详情
export async function getRule(id: string): Promise<Rule> {
  const response = await api.get<Rule>(`/api/rules/${id}`);
  return response.data;
}

// 更新规则
export async function updateRule(
  id: string,
  data: { name?: string; description?: string }
): Promise<Rule> {
  const response = await api.put<Rule>(`/api/rules/${id}`, data);
  return response.data;
}

// 删除规则
export async function deleteRule(id: string): Promise<void> {
  await api.delete(`/api/rules/${id}`);
}

// 构建规则 metric
export async function buildRuleMetric(id: string): Promise<void> {
  await api.post(`/api/rules/${id}/build`);
}

// ============ 多边形解析 API ============

// 解析多边形
export async function resolvePolygon(
  polygon: number[][]
): Promise<ResolvePolyResult> {
  const response = await api.post<ResolvePolyResult>('/api/resolve_poly', { polygon });
  return response.data;
}

// ============ 错误处理 ============

export function isApiError(error: unknown): error is AxiosError<{ error: string }> {
  return axios.isAxiosError(error);
}

export function getErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    return error.response?.data?.error || error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unknown error';
}

export default api;
