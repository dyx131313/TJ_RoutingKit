# 前端架构文档

## 概述

前端位于 app_frontend_v2，采用 React + TypeScript + Vite，承载路线查询、模板管理、规则管理和地图交互。

## 技术栈

| 技术 | 用途 |
|---|---|
| React 18 | 组件开发 |
| TypeScript 5 | 类型约束 |
| Vite 7 | 构建与开发服务器 |
| Ant Design 5 | UI 组件 |
| Leaflet + react-leaflet | 地图渲染 |
| Zustand | 全局状态 |
| Axios | API 请求 |

## 目录结构

```text
app_frontend_v2/
  src/
    components/
      Controls/
      Layout/
      Map/
      Panels/
    hooks/
    services/
    stores/
    types/
```

## 关键能力（当前实现）

### 路线控制

文件:

- src/components/Controls/RouteControls.tsx

能力:

- profile 切换: normal, morning_peak, evening_peak, walking, bus
- 支持 rule_id 输入
- 支持 plate 与 queryDate 输入
- 结果展示包含:
  - distance_meters
  - geo_distance_arcs_meters
  - travel_time
  - metric_travel_time
  - base_travel_time
  - 路径途经点数量与首末点

### 规则面板

文件:

- src/components/Panels/RulePanel.tsx

能力:

- 创建规则时可配置 plate_policy
- plate_policy 字段支持:
  - enabled
  - tails
  - weekdays
  - time_windows

### 路由请求链路

文件:

- src/hooks/useRoute.ts
- src/services/api.ts
- src/stores/routeStore.ts

能力:

- routeStore 管理 profile, ruleId, plate, queryDate
- queryRoute 支持传递 plate 与 queryDate
- 与后端 route 接口联动规则 metric 判定

## 状态管理模型

### mapStore

管理地图中心、起终点、绘制态、多边形预览、路径坐标。

### routeStore

关键字段:

- profile
- ruleId
- plate
- queryDate
- routeResult
- routeCoords
- loading
- error

### templateStore / ruleStore

分别管理模板与规则的列表、选中项、异步状态。

## 类型约定

文件:

- src/types/index.ts

关键类型:

- Profile: normal | morning_peak | evening_peak | walking | bus
- RouteResult: 包含 metric_travel_time, base_travel_time
- Rule: 包含 plate_policy

## 地图交互流程

1. 用户选择起点终点与 profile
2. 触发 useRoute.executeRoute
3. 调用 GET /route
4. 返回 path_coordinates 渲染到地图
5. 结果区同步展示距离与时间指标

## 规则执行体验

1. 用户在 RulePanel 创建规则并配置 plate_policy
2. 在 RouteControls 输入 plate/queryDate 查询
3. 命中策略时使用 signature metric
4. 未命中策略时回退常规 traffic modeler metric

## 构建与运行

开发:

```bash
cd app_frontend_v2
npm install
npm run dev
```

生产构建:

```bash
npm run build
```

## 已知事项

- 打包会提示 chunk 体积警告（非阻塞）
- 若后端接口字段升级，需同步 src/types/index.ts
- 本地离线瓦片依赖 Node 静态服务 /tiles
