# TJ_RoutingKit 升级计划

## 项目概述

**项目名称**: TJ_RoutingKit 离线地图路由工程升级
**当前状态**: 基于传统 HTML/jQuery + 文件系统存储的离线地图路径规划系统
**升级目标**: 现代 React+Vite 前端 + Redis+SQLite 数据库加速

---

## 一、升级目标

### 1.1 前端升级

| 维度 | 当前状态 | 升级后 |
|------|----------|--------|
| 框架 | 原生 HTML + jQuery | React 18 + Vite |
| UI 组件 | 基础 HTML 元素 | Material UI / Ant Design |
| 地图 | Leaflet (原生) | react-leaflet |
| 状态管理 | 全局变量 | Zustand / Redux Toolkit |
| 路由 | 无 | React Router |
| 代码组织 | 5个散落JS文件 | 模块化组件结构 |

### 1.2 后端数据库升级

| 维度 | 当前状态 | 升级后 |
|------|----------|--------|
| 模板存储 | JSON 文件 | SQLite |
| 规则存储 | JSON 文件 | SQLite |
| 热点缓存 | 文件系统 | Redis |
| Metric 缓存 | 二进制文件 | Redis + 文件系统 |
| 连接管理 | 每次新建 TCP | 连接池 |

---

## 二、详细实施计划

### 阶段一：前端 React+Vite 重构 (预计 2-3 周)

#### 1.1 项目初始化
```
- 创建 Vite + React 项目
- 配置 TypeScript
- 安装依赖: react-leaflet, zustand, react-router-dom, antd
- 配置 ESLint + Prettier
```

#### 1.2 组件架构设计
```
src/
├── components/
│   ├── Map/
│   │   ├── MapView.tsx        # 地图主组件
│   │   ├── RoutePolyline.tsx  # 路径渲染
│   │   ├── Markers.tsx       # 起点/终点标记
│   │   └── PolygonDrawer.tsx # 多边形绘制
│   ├── Controls/
│   │   ├── RouteForm.tsx      # 路径查询表单
│   │   ├── ProfileSelect.tsx  # 交通模式选择
│   │   └── RuleSelect.tsx     # 规则选择
│   ├── Panels/
│   │   ├── TemplatePanel.tsx  # 模板管理面板
│   │   ├── RulePanel.tsx      # 规则管理面板
│   │   └── PreviewPanel.tsx   # 预览面板
│   └── Layout/
│       ├── Header.tsx         # 导航栏
│       └── Sidebar.tsx        # 侧边栏
├── hooks/
│   ├── useRoute.ts            # 路径查询 Hook
│   ├── useTemplates.ts        # 模板管理 Hook
│   └── useRules.ts            # 规则管理 Hook
├── stores/
│   ├── mapStore.ts            # 地图状态
│   ├── routeStore.ts          # 路由状态
│   └── templateStore.ts       # 模板状态
├── services/
│   ├── api.ts                 # API 封装
│   └── websocket.ts           # WebSocket (可选)
├── types/
│   └── index.ts               # TypeScript 类型定义
└── pages/
    ├── Home.tsx               # 主页面
    └── Settings.tsx           # 设置页面
```

#### 1.3 现有功能迁移清单

| 功能模块 | 原实现 | React 实现方式 |
|----------|--------|----------------|
| 地图初始化 | map.js initMap() | MapView 组件 + useEffect |
| 路径规划 | route() 函数 | useRoute hook |
| 多边形绘制 | controls.js toggleDrawPoly | PolygonDrawer 组件 |
| 模板管理 | templates.js | TemplatePanel + useTemplates |
| 规则管理 | rules.js | RulePanel + useRules |
| API 调用 | api.js fetch | axios + react-query |

#### 1.4 UI 美化方案

```
1. 导航栏: Ant Design NavBar + 暗色主题
2. 地图控制: Ant Design Card 悬浮面板
3. 表单组件: Ant Design Form + Input + Select
4. 按钮: Ant Design Button (primary/ghost)
5. 表格: Ant Design Table (模板/规则列表)
6. 模态框: Ant Design Modal (创建/编辑)
7. 通知: Ant Design Message (操作反馈)
8. 加载: Ant Design Spin (异步等待)
9. 图标: @ant-design/icons
```

---

### 阶段二：数据库集成 (预计 1-2 周)

#### 2.1 SQLite 数据库设计

```sql
-- 模板表
CREATE TABLE templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    signature VARCHAR(64) UNIQUE NOT NULL,
    type VARCHAR(20) NOT NULL, -- 'polygon', 'arc_ids', 'tag_filter'
    canonical TEXT NOT NULL,   -- JSON 存储
    original TEXT,            -- JSON 原始输入
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME        -- 软删除
);

-- 规则表
CREATE TABLE rules (
    id VARCHAR(20) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    template_signatures TEXT NOT NULL, -- JSON 数组
    merged_arc_count INTEGER,
    metric_path VARCHAR(255),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 模板解析缓存表
CREATE TABLE resolve_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    polygon_hash VARCHAR(64) UNIQUE NOT NULL,
    policy VARCHAR(20) DEFAULT 'both_inside',
    arc_count INTEGER NOT NULL,
    arc_ids TEXT NOT NULL,     -- JSON 数组
    arc_coords TEXT NOT NULL,  -- JSON 数组
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX idx_templates_signature ON templates(signature);
CREATE INDEX idx_templates_type ON templates(type);
CREATE INDEX idx_resolve_cache_hash ON resolve_cache(polygon_hash);
```

#### 2.2 Redis 缓存设计

```
Key 命名规范:
- 路由前缀: rk: (routing kit)

缓存键:
- rk:template:{signature}           # 模板详情 (TTL: 24h)
- rk:rule:{id}                      # 规则详情 (TTL: 24h)
- rk:resolve_poly:{hash}            # 多边形解析结果 (TTL: 12h)
- rk:nearest:{lat},{lon}            # 最近节点缓存 (TTL: 1h)
- rk:route:{from},{to},{profile}    # 路由结果缓存 (TTL: 30m)
- rk:metric:{signature}             # Metric 二进制数据 (TTL: 24h)
- rk:info                           # C++ 服务信息 (TTL: 5m)
```

#### 2.3 Node.js 集成方案

```javascript
// 安装依赖
npm install better-sqlite3 ioredis

// 目录结构
app_node/
├── db/
│   ├── sqlite.js      # SQLite 连接池
│   ├── migrations/   # 迁移脚本
│   └── models/        # 数据模型
├── cache/
│   └── redis.js      # Redis 客户端
└── index.js          # 入口 (重构)
```

---

### 阶段三：性能优化 (预计 1 周)

#### 3.1 连接池优化
- Node.js 到 C++ 后端: 使用持久化 TCP 连接或连接池
- 避免每次请求新建连接

#### 3.2 API 层优化
- 实现 `react-query` / `SWR` 进行请求缓存
- 热点数据预加载

#### 3.3 C++ 后端扩展 (可选)
- 支持 HTTP 协议 (现有 TCP + JSON)
- 多线程请求处理

---

## 三、实施顺序

```
┌─────────────────────────────────────────────────────────────┐
│ 阶段一: 前端重构 (2-3周)                                      │
├─────────────────────────────────────────────────────────────┤
├── 1.1 项目初始化 + 依赖安装                                    │
├── 1.2 基础组件开发 (Map, Controls)                            │
├── 1.3 模板/规则管理面板开发                                    │
├── 1.4 UI 美化 + 响应式适配                                    │
└── 1.5 与现有 Node.js API 对接测试                             │
                                                              │
├─────────────────────────────────────────────────────────────┤
│ 阶段二: 数据库集成 (1-2周)                                     │
├─────────────────────────────────────────────────────────────┤
├── 2.1 SQLite 数据库搭建 + 迁移                                 │
├── 2.2 Redis 缓存层搭建                                       │
├── 2.3 Node.js 数据访问层重构                                  │
├── 2.4 数据迁移 (JSON -> SQLite)                              │
└── 2.5 缓存策略实施                                            │
                                                              │
├─────────────────────────────────────────────────────────────┤
│ 阶段三: 性能优化 (1周)                                        │
├─────────────────────────────────────────────────────────────┤
├── 3.1 TCP 连接池                                             │
├── 3.2 API 缓存策略                                           │
└── 3.3 压力测试 + 调优                                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 四、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 原有功能丢失 | 高 | 详细功能测试清单 |
| 性能下降 | 中 | 基准测试 + 优化 |
| 数据迁移丢失 | 高 | 迁移脚本验证 + 备份 |
| Redis 连接失败 | 中 | 降级到文件系统缓存 |
| C++ 后端兼容 | 中 | 保持 TCP 协议兼容 |

---

## 五、验收标准

### 前端
- [ ] 所有原有功能正常运行
- [ ] UI 符合现代导航应用风格
- [ ] 响应式布局支持移动端
- [ ] TypeScript 类型检查通过
- [ ] 构建无警告无错误

### 后端
- [ ] SQLite 正常存储/读取模板和规则
- [ ] Redis 缓存正常工作
- [ ] 数据迁移完整无误
- [ ] API 响应时间 < 100ms (不含路由计算)
- [ ] 压力测试通过 (100 并发)

---

## 六、技术栈汇总

| 层级 | 技术 |
|------|------|
| 前端框架 | React 18 + Vite |
| UI 组件库 | Ant Design 5 |
| 地图 | react-leaflet |
| 状态管理 | Zustand |
| 请求库 | axios + React Query |
| 后端运行时 | Node.js |
| 数据库 | SQLite (better-sqlite3) |
| 缓存 | Redis (ioredis) |
| 路由计算 | C++ RoutingKit (不变) |

---

## 七、后续扩展建议

1. **用户系统**: 引入 JWT 认证 + 用户隔离
2. **WebSocket**: 实时推送路由计算进度
3. **多地图源**: 支持多种地图瓦片切换
4. **轨迹记录**: 存储用户历史查询
5. **API 文档**: Swagger/OpenAPI 规范化

---

*文档版本: v1.0*
*创建日期: 2026-03-07*
