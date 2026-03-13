# API 接口文档

## 基础信息

- Base URL: http://localhost:3000
- 前端开发地址: http://localhost:5173
- 默认返回: application/json
- 时间单位: 毫秒(ms)

## 路由查询

### GET /route

说明: 路径查询主接口，支持 profile、规则 metric、车牌策略判定。

查询参数:

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| from | string | 是 | 起点坐标，格式 lat,lon |
| to | string | 是 | 终点坐标，格式 lat,lon |
| profile | string | 否 | normal, morning_peak, evening_peak, walking, bus |
| time | string/number | 否 | 查询时间（可选） |
| metric_sig | string | 否 | 模板度量签名 |
| rule_id | string | 否 | 规则 ID |
| plate | string | 否 | 车牌尾号判定输入 |
| query_date | string | 否 | 规则判定时间，建议 ISO 字符串 |

返回示例:

```json
{
  "metric_distance": 582112,
  "metric_source": "traffic_modeler:normal",
  "metric_unit": "ms",
  "travel_time": 582112,
  "metric_travel_time": 582112,
  "base_travel_time": 582112,
  "distance_meters": 9375,
  "geo_distance_arcs_meters": 9480,
  "path_coordinates": [[31.22, 121.41], [31.21, 121.48]]
}
```

字段说明:

- travel_time: 对用户展示的时间（规则 metric 下优先回填基础路网时间）
- metric_travel_time: 度量上的时间和（用于诊断）
- base_travel_time: 基础路网弧时间和（用于对比）
- metric_source: 度量来源，常见值:
  - traffic_modeler:normal
  - traffic_modeler:morning_peak
  - traffic_modeler:evening_peak
  - traffic_modeler:walking
  - traffic_modeler:bus
  - signature:<metric_path>
  - bucket:<index>
  - perfect_witness:normal

---

## 模板接口

### POST /api/templates

创建模板。

请求体示例:

```json
{
  "type": "polygon",
  "name": "内环示例",
  "polygon": [[31.23, 121.47], [31.24, 121.48], [31.25, 121.47]],
  "description": "示例模板"
}
```

### GET /api/templates

获取模板列表。

可选参数:

- includeDeleted: 是否包含回收站模板

### GET /api/templates/:signature

获取模板详情。

### GET /api/templates/:signature/preview

预览模板影响弧，返回 policy 与弧坐标。

### POST /api/templates/:signature/precompute

预计算模板影响弧。

### POST /api/templates/:signature/build

构建模板度量文件 metric_sig_<signature>.bin。

### DELETE /api/templates/:signature

软删除模板。

### POST /api/templates/:signature/restore

恢复模板。

---

## 规则接口

### POST /api/rules

创建规则。

请求体示例:

```json
{
  "name": "工作日限行",
  "templates": ["sig1", "sig2"],
  "plate_policy": {
    "enabled": true,
    "tails": ["1", "3", "5"],
    "weekdays": [1, 2, 3, 4, 5],
    "time_windows": [{"start": "07:00", "end": "20:00"}]
  }
}
```

### GET /api/rules

获取规则列表。

### GET /api/rules/:id

获取规则详情。

### PUT /api/rules/:id

更新规则（支持更新 plate_policy）。

### DELETE /api/rules/:id

删除规则。

### POST /api/rules/:id/build

构建规则 metric。

---

## 多边形解析接口

### POST /api/resolve_poly

解析多边形影响弧。

请求体示例:

```json
{
  "polygon": [[31.23, 121.47], [31.24, 121.48], [31.25, 121.47]]
}
```

返回示例:

```json
{
  "policy": "inside_or_intersect",
  "arc_count": 14364,
  "arc_ids": [123, 456],
  "arc_coords": [
    {"arc": 123, "u": [31.23, 121.47], "v": [31.24, 121.48]}
  ]
}
```

说明:

- inside_or_intersect: 端点在多边形内，或弧段与多边形边界相交，即判定受影响。

---

## 缓存与增量更新

### POST /api/cache/flush

清空路由结果缓存（Redis 或内存后备）。

返回示例:

```json
{
  "ok": true
}
```

### POST /api/graph/update_weights

局部更新弧权重并重建运行时 metric。

请求体示例:

```json
{
  "updates": [
    {"arc": 102, "weight": 123456},
    {"arc": 103, "weight": 456789}
  ]
}
```

返回示例:

```json
{
  "updated_arcs": 2,
  "status": "ok"
}
```

---

## 系统接口

### GET /health

服务健康检查。

### GET /api/status

运行状态与数据规模信息。

---

## 错误格式

错误返回遵循如下模式:

```json
{
  "error": "message"
}
```

常见错误:

- 400: 参数格式错误
- 404: 资源不存在（如 rule_id 不存在）
- 500: 后端处理失败
- 503: C++ 路由服务不可用

---

## 验收脚本

项目提供阶段验收脚本:

```bash
cd TJ_RoutingKit
./tools/acceptance_p0_p1_p3.sh
```

覆盖范围:

- 缓存 flush
- normal/walking/bus 查询
- update_weights 增量更新
- 车牌命中与未命中行为
- 缓存命中冒烟验证
