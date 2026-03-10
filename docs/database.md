# 数据库架构文档

## 概述

TJ_RoutingKit 采用混合存储架构，结合 SQLite 持久化存储与 Redis 高速缓存。数据库模块位于 `app_node/db/` 目录下。

## 数据库文件

- **位置**: `app_node/db/routingkit.db`
- **引擎**: better-sqlite3 (同步 SQLite)

## 表结构

### templates - 模板表

存储路由限制/偏好模板。

```sql
CREATE TABLE templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  signature TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('polygon', 'arc_ids', 'tag_filter')),
  canonical TEXT NOT NULL DEFAULT '{}',
  original TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME
);
```

**字段说明**:
- `signature`: 模板唯一签名 (HMAC-SHA256)
- `type`: 模板类型
  - `polygon`: 多边形区域模板
  - `arc_ids`: 指定弧ID模板
  - `tag_filter`: 标签过滤模板
- `canonical`: 规范化后的模板定义
- `original`: 原始模板定义
- `deleted_at`: 软删除时间戳 (有值表示已删除)

### rules - 规则表

存储合并多个模板的规则。

```sql
CREATE TABLE rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  template_signatures TEXT NOT NULL DEFAULT '[]',
  metric_path TEXT,
  merged_arc_count INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**字段说明**:
- `id`: 规则唯一标识 (自定义字符串)
- `name`: 规则名称
- `description`: 规则描述
- `template_signatures`: 关联的模板签名数组 (JSON)
- `metric_path`: 生成的度量文件路径
- `merged_arc_count`: 合并后的弧数量

### resolve_cache - 解析缓存表

存储多边形解析结果缓存。

```sql
CREATE TABLE resolve_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  polygon_hash TEXT NOT NULL,
  policy TEXT NOT NULL DEFAULT 'both_inside',
  arc_count INTEGER NOT NULL,
  arc_ids TEXT NOT NULL DEFAULT '[]',
  arc_coords TEXT NOT NULL DEFAULT '[]',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(polygon_hash, policy)
);
```

**字段说明**:
- `polygon_hash`: 多边形坐标的 SHA-256 哈希
- `policy`: 判定策略 (`both_inside`)
- `arc_count`: 受影响弧数量
- `arc_ids`: 受影响弧ID数组 (JSON)
- `arc_coords`: 弧坐标数组 (JSON)

### route_history - 路由历史表

存储路由查询历史。

```sql
CREATE TABLE route_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_lat REAL NOT NULL,
  from_lon REAL NOT NULL,
  to_lat REAL NOT NULL,
  to_lon REAL NOT NULL,
  profile TEXT DEFAULT 'normal',
  distance_meters REAL,
  duration_seconds INTEGER,
  metric_sig TEXT,
  rule_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**字段说明**:
- `from_lat`, `from_lon`: 起点坐标
- `to_lat`, `to_lon`: 终点坐标
- `profile`: 出行配置 (normal/morning_peak/evening_peak)
- `distance_meters`: 距离 (米)
- `duration_seconds`: 时间 (秒)
- `metric_sig`: 使用的模板签名
- `rule_id`: 使用的规则ID

## 索引

```sql
-- 模板签名索引
CREATE INDEX idx_templates_signature ON templates(signature);

-- 模板软删除索引
CREATE INDEX idx_templates_deleted ON templates(deleted_at);

-- 解析缓存哈希索引
CREATE INDEX idx_resolve_cache_hash ON resolve_cache(polygon_hash, policy);

-- 路由历史时间索引
CREATE INDEX idx_route_history_created ON route_history(created_at DESC);
```

## 缓存策略

### Redis 缓存

项目使用 Redis 作为高速缓存层，位于 `app_node/cache/redis.js`。

#### 缓存键结构

| 命名空间 | 键格式 | 用途 | TTL |
|---------|--------|------|-----|
| template | `tpl:{signature}` | 模板详情缓存 | 1小时 |
| rule | `rule:{id}` | 规则缓存 | 1小时 |
| resolvePoly | `rp:{polygon_hash}` | 解析结果缓存 | 24小时 |
| nearest | `near:{lat},{lon}` | 最近点缓存 | 30分钟 |
| route | `rt:{from},{to},{profile}` | 路由结果缓存 | 5分钟 |

#### 缓存操作

```javascript
// 获取
await cache.template.get(signature);

// 设置 (自动 TTL)
await cache.template.set(signature, data);

// 删除
await cache.template.del(signature);
```

## 混合存储层

`app_node/models/hybrid.js` 实现了数据库优先、文件系统兜底的混合存储策略：

### 读取流程

1. 优先从 SQLite 读取
2. 若无结果，尝试从 Redis 获取缓存
3. 若缓存无，fallback 到文件系统读取

### 写入流程

1. 首先尝试写入 SQLite
2. 写入成功后，同步更新 Redis 缓存
3. 若数据库操作失败，写入文件系统作为兜底

### 迁移脚本

`app_node/scripts/migrate.js` 用于将现有文件系统数据迁移到 SQLite：

```bash
cd app_node
node scripts/migrate.js
```

迁移内容包括：
- 模板: `cache/<hash>/templates/tpl_*.json`
- 规则: `cache/<hash>/rules/rules_*.json`
- 解析缓存: `cache/<hash>/templates/resolve_poly_*.json`

## 数据流

```
┌─────────────────────────────────────────────────────────────┐
│                        前端 (React)                          │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP/WebSocket
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Node.js 网关                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   Express    │  │  HybridStore │  │   Redis Cache    │  │
│  │   API Server │──│   (Model)    │◄─│   (ioredis)      │  │
│  └──────────────┘  └──────┬───────┘  └──────────────────┘  │
│                          │                                   │
│                          ▼                                   │
│                  ┌───────────────┐                           │
│                  │    SQLite     │                           │
│                  │ (better-sqlite)                          │
│                  └───────────────┘                           │
└──────────────────────────┬──────────────────────────────────┘
                           │ TCP
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                 C++ 路由后端                                 │
│         (Customizable Contraction Hierarchy)                 │
└─────────────────────────────────────────────────────────────┘
```
