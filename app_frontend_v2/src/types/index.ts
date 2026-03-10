// 交通配置类型
export type Profile = 'normal' | 'morning_peak' | 'evening_peak';

// 模板类型
export type TemplateType = 'polygon' | 'arc_ids' | 'tag_filter';

// 地理坐标
export interface LatLng {
  lat: number;
  lon: number;
}

// 路径结果
export interface RouteResult {
  route?: [number, number][];
  path_coordinates?: [number, number][];
  distance?: number;
  distance_meters?: number;
  travel_time?: number;
  metric_distance?: number;
  metric_source?: string;
  metric_unit?: string;
  geo_distance_arcs_meters?: number;
}

// 模板
export interface Template {
  signature: string;
  type: TemplateType;
  canonical: {
    polygon?: number[][];
    arc_ids?: number[];
    tag_filter?: string;
  };
  original: {
    polygon?: number[][];
    arc_ids?: string;
    tag_filter?: { key: string; value: string };
  };
  created_at: string;
}

// 规则
export interface Rule {
  id: string;
  name: string;
  description?: string;
  templates: string[];
  merged_arc_count?: number;
  metric_path?: string;
  created_at: string;
  updated_at?: string;
}

// 多边形解析结果
export interface ResolvePolyResult {
  arc_count?: number;
  arc_ids?: number[];
  arc_coords?: Array<{
    arc: number;
    u: [number, number];
    v: [number, number];
  }>;
  policy?: string;
  // 支持后端返回的嵌套格式
  signature?: string;
  polygon?: number[][];
  precomputed?: boolean;
  preview?: {
    arc_coords?: Array<{
      arc: number;
      u: [number, number];
      v: [number, number];
    }>;
    arc_ids?: number[];
  };
}

// 模板预览
export interface TemplatePreview {
  arc_coords: Array<{
    arc: number;
    u: [number, number];
    v: [number, number];
  }>;
  polygon?: number[][];
}

// C++ 服务信息
export interface ServiceInfo {
  node_count: number;
  arc_count: number;
  travel_time_count: number;
}

// 最近节点结果
export interface NearestResult {
  node: number;
  lat: number;
  lon: number;
}

// API 错误
export interface ApiError {
  error: string;
}
