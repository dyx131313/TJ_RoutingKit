# TJ_RoutingKit 离线地图路由工程

## 项目简介

本仓库集成了高性能 C++ 路由算法库（RoutingKit）与完整的离线地图 Web 应用。
支持 OSM PBF 数据解析、离线瓦片地图展示、路径规划 API、交通模式切换等功能。

**最新架构升级**：本项目已完成现代化升级，采用 React+Vite 前端 + Node.js 后端 + SQLite/Redis 数据库的混合架构。

## 目录结构

```
TJ_RoutingKit/
├── app_frontend_v2/   # React + Vite + TypeScript 前端（现代导航界面）
├── app_node/          # Node.js 网关（API + SQLite + Redis 混合存储）
├── app_backend/       # C++ 路由服务（TCP服务器，路径计算）
├── tiles/             # 离线地图瓦片
├── data/              # OSM PBF 数据
├── cache/             # 缓存目录（CCH、模板、规则）
├── doc/               # RoutingKit 原始文档
└── docs/              # 项目开发文档
```

## 技术栈

### 前端 (app_frontend_v2)
- **框架**: React 18 + TypeScript
- **构建工具**: Vite 5
- **UI 组件库**: Ant Design 5
- **地图**: react-leaflet + Leaflet
- **状态管理**: Zustand
- **HTTP 客户端**: Axios

### 后端 (app_node)
- **运行时**: Node.js (ES Modules)
- **Web 框架**: Express + Socket.IO
- **数据库**: SQLite (better-sqlite3) - 持久化存储
- **缓存**: Redis (ioredis) - 高速缓存
- **混合存储**: 数据库优先，文件系统 fallback

### 核心算法 (app_backend)
- **路由算法**: Customizable Contraction Hierarchy (CCH)
- **数据源**: OpenStreetMap PBF

## 快速启动（详细）

下面列出从克隆仓库到在本地运行前端与后端的完整步骤。假设在一台 Linux 机器上，已安装常见开发工具（`git`, `build-essential`, `cmake`, `node`, `npm` 等）。

### 前置要求

- Node.js 18+ & npm
- Redis 服务（用于缓存）
- C++ 编译工具（用于后端）
- OSM PBF 数据文件

### 启动步骤

#### 1. 安装 Redis（如果未安装）

```bash
# Ubuntu/Debian
sudo apt install redis-server

# 启动 Redis
redis-server &
```

#### 2. 克隆并初始化项目

```bash
git clone <REPO_URL> TJ_RoutingKit
cd TJ_RoutingKit
```

#### 3. 安装前端依赖并启动

```bash
cd app_frontend_v2
npm install
npm run dev
# 前端运行在 http://localhost:5173
```

#### 4. 安装后端依赖并启动

```bash
cd ../app_node
npm install

# 首次运行前可选择迁移现有数据到数据库
node scripts/migrate.js

# 启动 Node.js 网关
node index.js &> node.log &
```

#### 5. 启动 C++ 后端

```bash
cd ../app_backend
make -j$(nproc)
./routing_server --pbf ../data/your-data.osm.pbf &> routing_server.log &
```

#### 6. 访问应用

打开浏览器访问：`http://localhost:5173`

---

## 混合存储架构

### 概述

项目采用数据库优先、文件系统兜底的混合存储策略：

1. **SQLite** - 主存储：模板、规则、解析缓存等结构化数据
2. **Redis** - 高速缓存：热点数据、查询结果缓存
3. **文件系统** - 兜底方案：与原有系统兼容，CCH 缓存、metric 二进制文件

### 数据模型

#### 模板 (templates)
| 字段 | 类型 | 描述 |
|------|------|------|
| id | INTEGER | 主键 |
| signature | TEXT | 唯一签名 (HMAC) |
| type | TEXT | 类型: polygon/arc_ids/tag_filter |
| canonical | TEXT | 规范形式 JSON |
| original | TEXT | 原始形式 JSON |
| deleted_at | DATETIME | 软删除时间戳 |

#### 规则 (rules)
| 字段 | 类型 | 描述 |
|------|------|------|
| id | TEXT | 主键 (自定义ID) |
| name | TEXT | 规则名称 |
| description | TEXT | 规则描述 |
| template_signatures | TEXT | 关联模板签名数组 JSON |
| metric_path | TEXT | 度量文件路径 |
| merged_arc_count | INTEGER | 合并弧数量 |

#### 解析缓存 (resolve_cache)
| 字段 | 类型 | 描述 |
|------|------|------|
| polygon_hash | TEXT | 多边形 SHA256 哈希 |
| policy | TEXT | 判定策略 |
| arc_count | INTEGER | 受影响弧数量 |
| arc_ids | TEXT | 弧ID数组 JSON |
| arc_coords | TEXT | 弧坐标数组 JSON |

### 迁移脚本

首次部署或升级时可运行迁移脚本将现有文件系统数据迁移至数据库：

```bash
cd app_node
node scripts/migrate.js
```

---

## 离线地图与路径规划

- 地图瓦片全部本地加载，前端无需外网。
- 支持多种交通模式（normal/morning_peak/evening_peak/walking/bus）切换。
- 路径查询结果实时展示于地图。

## 阶段完成情况（2026-03）

- 已完成: P0（路径详情展示、服务常驻）
- 已完成: P1（路由缓存策略、车牌限行扩展）
- 已完成: P3（增量更新、多出行方式）
- 部分完成: P3 完美见证优化（已接入可选开关、校验与自动降级；当前数据集构建不稳定）

参考文档:

- docs/priority.md
- docs/api.md
- docs/frontend.md
- docs/quickstart.md
- docs/progress-summary-2026-03.md

## 文档导航（精简版）

- docs/quickstart.md: 启动、重启、验收脚本
- docs/api.md: 后端接口与返回字段说明
- docs/frontend.md: 前端结构、状态流与交互能力
- docs/priority.md: 研发优先级与完成状态
- docs/progress-summary-2026-03.md: 阶段性完成情况总结

## 已实现的新特性（模板与度量）

本项目已实现一套用于表达”限行/偏好模板”的机制，配合 Node 网关和 C++ 后端可在查询时应用自定义度量：

- **模板文件**：模板以 canonical JSON 存放于 `cache/<pbf-hash>/templates/tpl_<sig>.json`，并使用 HMAC 签名以保证一致性与不可篡改性。

- **预计算（RESOLVE_POLY）**：对模板多边形进行弧（edge/arc）影响预计算，产生 `resolve_poly_<hash>.json`，用于前端高亮与 Node 构建 metric 参考。

- **度量二进制（metric_sig）**：通过 Node 的 `/api/templates/:sig/build` 接口可以生成 `metric_sig_<sig>.bin`，格式为 8 字节小端 uint64 长度 + N 个 uint32 小端权重。Node 会使用 `INFO` 接口确认权重数量与后端一致。

- **查询时应用 metric**：前端/HTTP 客户端可向 Node 的 `/route` 传入 `metric_sig` 参数，Node 会将该签名作为 `metric_sig:<hex>` 追加到发往 C++ 的 TCP 文本请求行，后端解析并加载相应二进制度量以执行定制化查询。

- **时间桶与缓存**：后端支持按时间桶（`--bucket-minutes`）预生成并缓存多个 metric，以便在不同时间段快速切换并减少重复定制开销。

示例：生成并使用模板度量

1. 在 Node 上构建度量：

```bash
curl -X POST http://127.0.0.1:3000/api/templates/<sig>/build
```

2. 发起带模板的路由请求：

```bash
curl “http://127.0.0.1:3000/route?from=LAT1,LON1&to=LAT2,LON2&metric_sig=<sig>”
```

度量系统已在本地开发环境完成端到端验证：Node 生成的 `metric_sig` 能被 C++ 后端识别并影响路由结果。

## 预览影响（Polygon / Template）

本项目支持在前端绘制多边形并”预览影响”的弧段，或对已保存的模板进行预览。

- **判定策略（policy）**：RESOLVE_POLY 当前采用 `inside_or_intersect` 策略，即端点在多边形内部，或弧段与多边形边界相交，都会计为受影响。
  - 后端响应示例（字段节选）：
    ```json
    { "policy": "inside_or_intersect", "arc_count": 14364, "arc_ids": [...], "arc_coords": [...] }
    ```
  - Node 网关在读取历史缓存时，如发现 policy 不受支持，会自动请求后端重算并覆盖旧缓存。

- **缓存位置**：`cache/<pbf-hash>/templates/resolve_poly_<sha256>.json`
  - Key 由多边形坐标（6 位小数）规范化后按顺序拼接并取 SHA-256 生成。
  - 如需手工清理缓存：
    ```bash
    rm -f cache/*/templates/resolve_poly_*.json
    ```

- **前端交互**：
  - “绘制多边形”→”预览影响”→地图上以蓝色线段高亮所有受影响弧
  - “取消绘制”会清理当前多边形以及各类预览图层
  - 模板与规则面板已拆分为左右两侧互不遮挡

---

## API 速览

### 路由 API

```bash
# 基本路由
GET /route?from=lat,lon&to=lat,lon

# 带profile
GET /route?from=lat,lon&to=lat,lon&profile=normal|morning_peak|evening_peak|walking|bus

# 带模板度量
GET /route?from=lat,lon&to=lat,lon&metric_sig=<signature>

# 带规则
GET /route?from=lat,lon&to=lat,lon&rule_id=<rule-id>

# 车牌规则判定
GET /route?from=lat,lon&to=lat,lon&rule_id=<rule-id>&plate=A12345&query_date=2026-03-11T08:30:00
```

### 模板 API

```bash
# 创建模板
POST /api/templates
Body: { “type”: “polygon”, “polygon”: [...], “name”: “...” }

# 获取模板列表
GET /api/templates

# 获取模板详情
GET /api/templates/:signature

# 预览模板影响
GET /api/templates/:signature/preview

# 预计算
POST /api/templates/:signature/precompute

# 构建度量文件
POST /api/templates/:signature/build

# 删除（软删除）
DELETE /api/templates/:signature

# 恢复
POST /api/templates/:signature/restore
```

### 规则 API

```bash
# 创建规则
POST /api/rules
Body: { “name”: “...”, “templates”: [“sig1”, “sig2”] }

# 获取规则列表
GET /api/rules

# 获取规则详情
GET /api/rules/:id

# 更新规则
PUT /api/rules/:id

# 删除规则
DELETE /api/rules/:id

# 构建度量
POST /api/rules/:id/build
```

### 辅助 API

```bash
# 最近点查询
GET /nearest?lat=lat&lon=lon

# 解析多边形
POST /api/resolve_poly
Body: { “polygon”: [[lat,lon], ...] }

# 清理路由缓存
POST /api/cache/flush

# 增量更新弧权
POST /api/graph/update_weights
Body: { "updates": [{"arc": 102, "weight": 123456}] }
```

---

## RoutingKit 文档与引用

RoutingKit 原生文档与学术引用见 `doc/` 目录：

- [Setup and Installation](doc/Setup.md)
- [Support Functionality](doc/SupportFunctions.md)
- [Contraction Hierarchy](doc/ContractionHierarchy.md)
- [Customizable Contraction Hierarchy](doc/CustomizableContractionHierarchy.md)
- [OpenStreetMap Importer](doc/OpenStreetMap.md)
- [Converting Coordinates to Node ID](doc/CoordinatesToNodeID.md)

---

## 调试与日志

### C++ 后端

```bash
# 获取后端信息
echo “INFO” | nc 127.0.0.1 12345
```

- RESOLVE_POLY 在终端输出受影响弧数量日志

### Node 网关

- 对 route 结果会记录 `metric_unit` 与 `metric_source`
- 对 resolve_poly 遇到策略不匹配或历史截断会自动重算并覆盖缓存

---

## 常见问题

- **预览只显示部分弧**：清理 `cache/*/templates/resolve_poly_*.json` 或等待自动重算

- **Node 提示 C++ 不可达**：检查 C++ 进程是否运行、是否监听 12345

- **metric 权重数量不匹配**：使用 `INFO` 获取 `travel_time_count`，确认生成的 metric 长度一致

---

## 开发提示

- 快速重编译 C++ 后端：
  ```bash
  cd app_backend && make -j$(nproc)
  ```

- 清理并重启后端：
  ```bash
  pkill -f routing_server || true
  ./app_backend/routing_server --pbf ./data/shanghai.osm.pbf &> routing_server.log &
  ```

- 清理预览缓存：
  ```bash
  rm -f cache/*/templates/resolve_poly_*.json
  ```

- 运行迁移脚本：
  ```bash
  cd app_node && node scripts/migrate.js
  ```
