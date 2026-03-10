# 前端架构文档

## 概述

TJ_RoutingKit 前端采用 React + TypeScript + Vite 构建，提供现代化的离线地图导航界面。位于 `app_frontend_v2/` 目录下。

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18.x | UI 框架 |
| TypeScript | 5.x | 类型安全 |
| Vite | 5.x | 构建工具 |
| Ant Design | 5.x | UI 组件库 |
| react-leaflet | 4.x | 地图渲染 |
| Leaflet | 1.9.x | 地图库 |
| Zustand | 4.x | 状态管理 |
| Axios | 1.x | HTTP 客户端 |

## 目录结构

```
app_frontend_v2/
├── src/
│   ├── components/        # React 组件
│   │   ├── Controls/      # 路由控制组件
│   │   ├── Layout/        # 布局组件
│   │   ├── Map/           # 地图组件
│   │   └── Panels/        # 侧边面板组件
│   ├── hooks/             # 自定义 Hooks
│   ├── services/          # API 服务层
│   ├── stores/            # Zustand 状态管理
│   ├── types/             # TypeScript 类型定义
│   ├── assets/            # 静态资源
│   ├── App.tsx            # 应用入口
│   ├── main.tsx          # 渲染入口
│   └── index.css          # 全局样式
├── public/                # 公共资源
├── package.json           # 项目依赖
├── vite.config.ts         # Vite 配置
└── tsconfig*.json         # TypeScript 配置
```

## 核心组件

### MapView - 地图组件

负责地图渲染、交互和图层管理。

**位置**: `src/components/Map/MapView.tsx`

**功能**:
- 加载离线瓦片地图
- 绘制起点/终点标记
- 绘制路线 (Polyline)
- 绘制多边形 (Polygon)
- 绘制受影响弧 (preview layer)

**主要属性**:

```typescript
interface MapViewProps {
  center: [number, number];    // 地图中心
  zoom: number;              // 缩放级别
}
```

### RouteControls - 路由控制组件

提供路径规划的用户界面。

**位置**: `src/components/Controls/RouteControls.tsx`

**功能**:
- 起点/终点输入
- 出行方式选择 (profile)
- 路由查询按钮
- 结果展示

### TemplatePanel - 模板面板

模板管理侧边栏。

**位置**: `src/components/Panels/TemplatePanel.tsx`

**功能**:
- 模板列表展示
- 模板搜索
- 模板创建 (多边形绘制)
- 模板预览
- 模板删除/恢复

### RulePanel - 规则面板

规则管理侧边栏。

**位置**: `src/components/Panels/RulePanel.tsx`

**功能**:
- 规则列表展示
- 规则创建 (选择模板)
- 规则预览
- 规则删除

### Header - 页头

应用顶部导航栏。

**位置**: `src/components/Layout/Header.tsx`

## 状态管理

采用 Zustand 进行状态管理，位于 `src/stores/` 目录。

### mapStore - 地图状态

```typescript
interface MapState {
  center: [number, number];
  zoom: number;
  from: [number, number] | null;
  to: [number, number] | null;
  drawingPolygon: [number, number][];
  previewArcs: ArcCoord[];
  routeLine: [number, number][];
}
```

### routeStore - 路由状态

```typescript
interface RouteState {
  profile: Profile;
  ruleId: string | null;
  result: RouteResult | null;
  loading: boolean;
  error: string | null;
}
```

### templateStore - 模板状态

```typescript
interface TemplateState {
  templates: Template[];
  selectedSignature: string | null;
  previewResult: TemplatePreview | null;
}
```

### ruleStore - 规则状态

```typescript
interface RuleState {
  rules: Rule[];
  selectedId: string | null;
}
```

## 自定义 Hooks

### useRoute - 路由查询

**位置**: `src/hooks/useRoute.ts`

```typescript
const { route, loading, error, query } = useRoute();

// 执行路由查询
query(from, to, { profile, metric_sig, rule_id });
```

### useTemplates - 模板操作

**位置**: `src/hooks/useTemplates.ts`

```typescript
const {
  templates,
  loading,
  create,
  remove,
  restore,
  preview,
  build
} = useTemplates();
```

### useRules - 规则操作

**位置**: `src/hooks/useRules.ts`

```typescript
const {
  rules,
  loading,
  create,
  update,
  remove,
  build
} = useRules();
```

## API 服务层

**位置**: `src/services/api.ts`

封装所有后端 API 调用。

### 核心方法

```typescript
// 路由查询
route(params: RouteParams): Promise<RouteResult>;

// 最近点
nearest(lat: number, lon: number): Promise<NearestResult>;

// 模板
getTemplates(includeDeleted?: boolean): Promise<Template[]>;
getTemplate(signature: string): Promise<Template>;
createTemplate(data: CreateTemplateDTO): Promise<Template>;
deleteTemplate(signature: string): Promise<void>;
restoreTemplate(signature: string): Promise<void>;
previewTemplate(signature: string): Promise<TemplatePreview>;
buildTemplate(signature: string): Promise<void>;

// 规则
getRules(): Promise<Rule[]>;
getRule(id: string): Promise<Rule>;
createRule(data: CreateRuleDTO): Promise<Rule>;
updateRule(id: string, data: UpdateRuleDTO): Promise<Rule>;
deleteRule(id: string): Promise<void>;
buildRule(id: string): Promise<void>;

// 多边形解析
resolvePoly(polygon: number[][]): Promise<ResolvePolyResult>;
```

## 类型定义

**位置**: `src/types/index.ts`

### 主要类型

```typescript
// 交通配置
type Profile = 'normal' | 'morning_peak' | 'evening_peak';

// 模板类型
type TemplateType = 'polygon' | 'arc_ids' | 'tag_filter';

// 地理坐标
interface LatLng {
  lat: number;
  lon: number;
}

// 路径结果
interface RouteResult {
  route: [number, number][];
  distance: number;
  travel_time: number;
  metric_distance?: number;
  metric_source?: string;
  metric_unit?: string;
  geo_distance_arcs_meters?: number;
}

// 模板
interface Template {
  signature: string;
  type: TemplateType;
  canonical: { polygon?: number[][]; arc_ids?: number[]; tag_filter?: string };
  original: { polygon?: number[][]; arc_ids?: string; tag_filter?: any };
  created_at: string;
}

// 规则
interface Rule {
  id: string;
  name: string;
  description?: string;
  templates: string[];
  merged_arc_count?: number;
  metric_path?: string;
  created_at: string;
}

// 解析结果
interface ResolvePolyResult {
  arc_count: number;
  arc_ids: number[];
  arc_coords: Array<{ arc: number; u: [number, number]; v: [number, number] }>;
  policy: string;
}
```

## 样式

### 全局样式

**位置**: `src/index.css`

包含:
- Ant Design 主题变量
- 地图容器样式
- 全局重置样式

### 组件样式

**位置**: `src/App.css`

包含:
- 布局样式
- 侧边栏样式
- 地图覆盖层样式

## 构建与运行

### 开发模式

```bash
cd app_frontend_v2
npm install
npm run dev
# 访问 http://localhost:5173
```

### 生产构建

```bash
npm run build
# 产物输出到 dist/ 目录
```

### 环境配置

可在 `.env` 文件中配置:

```
VITE_API_BASE_URL=http://localhost:3000
VITE_TILE_URL=/tiles/{z}/{x}/{y}.png
```

## 组件交互流程

```
用户操作
    │
    ▼
┌─────────────────┐
│   App.tsx       │  接收事件
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Hooks         │  业务逻辑处理
│  (useRoute等)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  API Service    │  调用后端接口
│  (api.ts)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Node.js 后端   │  HTTP 请求
└─────────────────┘
         │
         ▼
┌─────────────────┐
│  C++ 路由后端   │  TCP 通信
└─────────────────┘
```

## 地图交互

### 绘制多边形

1. 用户点击"绘制多边形"按钮
2. 激活 Leaflet Draw 工具
3. 用户在地图上绘制
4. 完成后调用 `/api/resolve_poly` 获取受影响弧
5. 在地图上渲染预览图层

### 执行路由

1. 用户输入起点/终点
2. 点击"查询"按钮
3. 调用 `/route` API
4. 接收路线坐标
5. 渲染 Polyline 到地图

### 应用模板/规则

1. 用户在面板选择模板/规则
2. 调用 `/api/templates/:sig/preview` 预览影响
3. 渲染受影响弧到地图
4. 调用 `/api/templates/:sig/build` 构建度量
5. 路由查询时带上 `metric_sig` 参数
