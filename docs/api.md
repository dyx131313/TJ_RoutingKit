# API 接口文档

## 基础信息

- **Base URL**: `http://localhost:3000`
- **前端端口**: `http://localhost:5173` (开发模式)
- **Content-Type**: `application/json`

## 路由 API

### 基本路由查询

```
GET /route?from=lat,lon&to=lat,lon
```

**参数**:

| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| from | string | 是 | 起点坐标 `纬度,经度` |
| to | string | 是 | 终点坐标 `纬度,经度` |
| profile | string | 否 | 出行配置: `normal`, `morning_peak`, `evening_peak` |
| metric_sig | string | 否 | 模板签名 (自定义度量) |
| rule_id | string | 否 | 规则ID |

**响应示例**:

```json
{
  "from": [31.2304, 121.4737],
  "to": [31.2304, 121.4737],
  "distance_meters": 5234,
  "duration_seconds": 845,
  "metric_unit": "travel_time",
  "metric_source": "default",
  "geo_distance_arcs_meters": 5180,
  "geometry": {
    "type": "LineString",
    "coordinates": [[121.4737, 31.2304], ...]
  }
}
```

### 最近点查询

```
GET /nearest?lat=lat&lon=lon
```

**参数**:

| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| lat | number | 是 | 纬度 |
| lon | number | 是 | 经度 |

**响应示例**:

```json
{
  "node_id": 123456,
  "lat": 31.2304,
  "lon": 121.4737,
  "distance_meters": 12.5
}
```

---

## 模板 API

### 创建模板

```
POST /api/templates
```

**请求体**:

```json
{
  "type": "polygon",
  "name": "我的限行区域",
  "polygon": [
    [31.23, 121.47],
    [31.24, 121.48],
    [31.25, 121.47]
  ],
  "description": "描述信息"
}
```

**type 选项**:
- `polygon`: 多边形区域
- `arc_ids`: 指定弧ID列表
- `tag_filter`: 标签过滤条件

**响应示例**:

```json
{
  "signature": "abc123...",
  "type": "polygon",
  "name": "我的限行区域",
  "created_at": "2025-03-07T12:00:00Z"
}
```

### 获取模板列表

```
GET /api/templates
```

**查询参数**:

| 参数 | 类型 | 描述 |
|------|------|------|
| includeDeleted | boolean | 是否包含已删除模板 |

**响应示例**:

```json
{
  "templates": [
    {
      "signature": "abc123...",
      "type": "polygon",
      "name": "模板名称",
      "created_at": "2025-03-07T12:00:00Z"
    }
  ]
}
```

### 获取模板详情

```
GET /api/templates/:signature
```

**响应示例**:

```json
{
  "signature": "abc123...",
  "type": "polygon",
  "canonical": {...},
  "original": {...},
  "created_at": "2025-03-07T12:00:00Z",
  "updated_at": "2025-03-07T12:00:00Z"
}
```

### 预览模板影响

```
GET /api/templates/:signature/preview
```

**响应示例**:

```json
{
  "policy": "both_inside",
  "arc_count": 14364,
  "arc_ids": [123, 456, ...],
  "arc_coords": [
    {"arc": 123, "u": [31.23, 121.47], "v": [31.24, 121.48]},
    ...
  ]
}
```

### 预计算模板

```
POST /api/templates/:signature/precompute
```

用于对包含多边形或弧ID的模板进行预先解析。

**响应示例**:

```json
{
  "success": true,
  "arc_count": 14364
}
```

### 构建度量文件

```
POST /api/templates/:signature/build
```

生成 `metric_sig_*.bin` 文件，用于查询时应用自定义度量。

**响应示例**:

```json
{
  "success": true,
  "metric_path": "cache/xxx/metric_sig_abc123.bin"
}
```

### 删除模板

```
DELETE /api/templates/:signature
```

执行软删除，移入回收站。

**响应示例**:

```json
{
  "success": true
}
```

### 恢复模板

```
POST /api/templates/:signature/restore
```

从回收站恢复模板。

**响应示例**:

```json
{
  "success": true
}
```

---

## 规则 API

### 创建规则

```
POST /api/rules
```

**请求体**:

```json
{
  "id": "rule-001",
  "name": "工作日限行",
  "description": "周一至周五高峰期限行",
  "templates": ["sig1", "sig2", "sig3"]
}
```

**响应示例**:

```json
{
  "id": "rule-001",
  "name": "工作日限行",
  "description": "周一至周五高峰期限行",
  "templates": ["sig1", "sig2", "sig3"],
  "created_at": "2025-03-07T12:00:00Z"
}
```

### 获取规则列表

```
GET /api/rules
```

**响应示例**:

```json
{
  "rules": [
    {
      "id": "rule-001",
      "name": "工作日限行",
      "description": "...",
      "templates": ["sig1", "sig2"],
      "created_at": "2025-03-07T12:00:00Z"
    }
  ]
}
```

### 获取规则详情

```
GET /api/rules/:id
```

**响应示例**:

```json
{
  "id": "rule-001",
  "name": "工作日限行",
  "description": "...",
  "templates": ["sig1", "sig2"],
  "metric_path": "cache/xxx/rule_metric_001.bin",
  "merged_arc_count": 25000,
  "created_at": "2025-03-07T12:00:00Z",
  "updated_at": "2025-03-07T12:00:00Z"
}
```

### 更新规则

```
PUT /api/rules/:id
```

**请求体**:

```json
{
  "name": "新名称",
  "description": "新描述",
  "templates": ["sig1", "sig2", "sig3"]
}
```

### 删除规则

```
DELETE /api/rules/:id
```

### 构建规则度量

```
POST /api/rules/:id/build
```

为规则构建合并度量文件。

**响应示例**:

```json
{
  "success": true,
  "metric_path": "cache/xxx/rule_metric_001.bin",
  "merged_arc_count": 25000,
  "metric_sig": "rule_001"
}
```

---

## 解析 API

### 解析多边形

```
POST /api/resolve_poly
```

**请求体**:

```json
{
  "polygon": [
    [31.23, 121.47],
    [31.24, 121.48],
    [31.25, 121.47]
  ]
}
```

**响应示例**:

```json
{
  "policy": "both_inside",
  "arc_count": 14364,
  "arc_ids": [123, 456, ...],
  "arc_coords": [
    {"arc": 123, "u": [31.23, 121.47], "v": [31.24, 121.48]},
    ...
  ]
}
```

---

## 系统 API

### 获取状态

```
GET /api/status
```

**响应示例**:

```json
{
  "cch_loaded": true,
  "pbf_hash": "abc123...",
  "node_count": 123456,
  "arc_count": 234567,
  "travel_time_count": 234567,
  "redis_connected": true,
  "sqlite_connected": true
}
```

### 获取配置

```
GET /api/config
```

**响应示例**:

```json
{
  "port": 3000,
  "cch_port": 12345,
  "cache_dir": "./cache",
  "default_profile": "normal"
}
```

---

## WebSocket 事件

系统支持 WebSocket 实时通信，用于地图更新等场景。

### 事件列表

| 事件 | 方向 | 描述 |
|------|------|------|
| route:start | 客户端→服务端 | 开始路由查询 |
| route:result | 服务端→客户端 | 路由结果 |
| route:error | 服务端→客户端 | 路由错误 |
| template:created | 服务端→客户端 | 模板创建通知 |
| template:updated | 服务端→客户端 | 模板更新通知 |
| map:update | 服务端→客户端 | 地图数据更新 |

---

## 错误响应

所有 API 错误响应遵循以下格式:

```json
{
  "error": true,
  "code": "ERROR_CODE",
  "message": "错误描述信息"
}
```

### 常见错误码

| 错误码 | HTTP状态码 | 描述 |
|--------|-----------|------|
| NOT_FOUND | 404 | 资源不存在 |
| INVALID_PARAMS | 400 | 参数错误 |
| TEMPLATE_EXISTS | 409 | 模板已存在 |
| RULE_EXISTS | 409 | 规则已存在 |
| CCH_NOT_LOADED | 503 | CCH 未加载 |
| BACKEND_UNAVAILABLE | 503 | 后端不可达 |
| METRIC_BUILD_FAILED | 500 | 度量构建失败 |
| DB_ERROR | 500 | 数据库错误 |
| CACHE_ERROR | 500 | 缓存错误 |

---

## 请求示例

### 使用 curl

```bash
# 基本路由
curl "http://localhost:3000/route?from=31.2304,121.4737&to=31.28,121.5"

# 带模板
curl "http://localhost:3000/route?from=31.2304,121.4737&to=31.28,121.5&metric_sig=abc123"

# 创建模板
curl -X POST http://localhost:3000/api/templates \
  -H "Content-Type: application/json" \
  -d '{"type":"polygon","name":"测试","polygon":[[31.23,121.47],[31.24,121.48],[31.25,121.47]]}'

# 获取规则列表
curl http://localhost:3000/api/rules
```

### 使用 JavaScript

```javascript
import axios from 'axios';

// 路由查询
const result = await axios.get('/route', {
  params: {
    from: '31.2304,121.4737',
    to: '31.28,121.5',
    profile: 'normal'
  }
});

// 创建模板
await axios.post('/api/templates', {
  type: 'polygon',
  name: '限行区域',
  polygon: [[31.23, 121.47], [31.24, 121.48], [31.25, 121.47]]
});
```
