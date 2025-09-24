
# TJ_RoutingKit 离线地图路由应用设计文档

## 1. 项目架构概览

本项目以 RoutingKit 算法库为核心，集成 C++ 路由服务、Node.js API 网关、Web 前端和离线地图瓦片，形成完整的离线路径规划应用。

### 目录结构

- app_backend/      C++ 路由服务（路径计算，支持多交通模式）
- app_node/         Node.js 服务（API转发，静态文件服务）
- app_frontend/     前端页面（地图展示与交互）
- tiles/            离线地图瓦片（本地加载）
- data/             OSM PBF 数据
- bin/ build/ src/  RoutingKit 算法库及工具

### 启动流程

1. 编译并启动 C++ 路由服务
2. 启动 Node.js 服务
3. 浏览器访问前端页面

各模块通过 TCP/HTTP 协作，前端地图与路径查询均为本地离线体验。

---


---

## 2. 算法与应用集成

核心算法仍基于 RoutingKit 的 CCH/CH 路径规划，应用层通过 C++ 服务和 Node.js 网关实现多场景权重切换、实时路径查询。

详细算法设计、权重模型、交通场景切换等内容请见原文档与源码注释。

---

## 3. 构建与维护

RoutingKit 算法库支持自动化 Makefile 生成，应用层各模块独立维护。

如需更新构建系统：

```bash
./generate_make_file > Makefile
```

---

## 4. 未来扩展

- 支持更多交通模式和动态权重
- 前端交互优化、移动端适配
- 路径结果丰富化（如路段信息、预计时间等）
- 容器化部署与云端集成

## 5. 最近实现的特性

下面列出在当前开发阶段已实现并正在使用的功能/技术要点，供开发和测试参考：

- **模板机制（personalized restriction templates）**：支持将用户的限行/偏好模板以 canonical JSON 格式保存并使用 HMAC 签名，模板文件存放在 `cache/<pbf-hash>/templates/tpl_<sig>.json`。

- **RESOLVE_POLY（多边形预计算）**：对模板多边形预计算受影响的弧（arc）列表，并能返回带端点坐标的预览（用于前端高亮与调试），缓存文件位于 `cache/.../templates/resolve_poly_<hash>.json`。

- **按模板生成的度量（metric_sig）**：Node 网关提供 `/api/templates/:sig/build` 接口，将模板转换为二进制度量文件 `metric_sig_<sig>.bin`，二进制格式为：8 字节小端 uint64 表示权重数量 N，后续跟 N 个 uint32 小端权重值；C++ 后端可在查询时通过 TCP 请求参数 `metric_sig:<hex>` 指定加载该度量并应用于查询。

- **时间桶度量（time-bucket metrics）与缓存**：后端支持将不同时间段（如 30 分钟一个桶）预编译为多个 metric 并缓存，参数 `--bucket-minutes` 和 `--buckets` 控制桶长度与数量。缓存位于 `cache/<pbf-hash>/` 下以便复用，减少重复定制成本。

- **TCP 文本协议与 Node 网关协作**：C++ 后端通过 TCP 文本行协议（默认监听端口 12345）提供 NEAREST、INFO、RESOLVE_POLY、以及通用路由命令；Node.js 作为 HTTP 网关转换前端请求并与后端通信（`/route` 支持附加 `metric_sig` 参数）。

- **工程与调试便利性**：增加了 `arc_coords` 预览、INFO 接口用于获取 `travel_time` 计数、以及基于预览的快速可视化，方便在前端和 Node 层定位模板影响范围。

这些功能已在当前分支的开发环境中验证：C++ 后端可加载由 Node 生成的 `metric_sig` 文件并使查询结果发生预期变化（见项目的测试记录）。

## 最近变更（近期实现的细节）

下面列出最近在后端、Node 网关与前端做出的关键改动，便于开发与运维团队理解输出语义与诊断方法：

- **后端：明确度量与几何距离**
	- 路由响应现在同时返回明确的度量值与几何距离：`metric_distance`（算法权重）、`distance_meters`（基于路径节点的 Haversine 物理距离）。
	- 当可用时还会返回 `geo_distance_arcs_meters`，通过沿查询返回的弧路径（`get_arc_path()`）对图中 `graph.geo_distance` 逐弧求和得到，更准确地反映图上弧长度。
	- 为避免歧义，后端会返回 `metric_unit`（例如 `ms`）和 `metric_source`（如 `bucket:0`、`signature:<path>` 或 `traffic_modeler:<profile>`）来说明 `metric_distance` 的来源与单位。

- **Node 网关：转发与诊断**
	- Node (`app_node/index.js`) 保持对后端 JSON 的原样转发，但在收到包含 `metric_unit`/`metric_source` 字段时会将其记录到服务日志，便于线上诊断与审计。
	- Node 对 `RESOLVE_POLY` 的缓存与 `metric_sig` 文件管理逻辑未变，但会优先使用磁盘缓存 `cache/<pbf-hash>/templates/resolve_poly_<hash>.json` 来避免重复解析。

- **前端：单位感知的展示**
	- 前端在显示 `metric_distance` 时会参考 `metric_unit`；当 `metric_unit == 'ms'` 时会同时显示毫秒与换算后的秒数（例如 `50400 ms (~50.40 s)`），以减少单位误读。
	- 若 `metric_unit` 缺失，前端会给出兼容提示，提醒用户该 metric 可能是 travel_time_ms 或其它权重单位。

- **实现与运行提示**
	- 后端必须以 `--pbf <path>` 参数正确启动以载入路网与缓存。重启后若遗漏 `--pbf` 会导致服务不可用并返回错误信息（请检查 `routing_server.log`）。
	- 在调试度量问题时，可以使用 Node 的 `INFO` 转发（`echo "INFO" | nc 127.0.0.1 12345`）来查询后端返回的 `travel_time_count` / `arc_count` 等元信息，以确保生成的 `metric_sig` 与后端一致。

示例：一次典型的 `/route` 返回（已格式化）如下所示，便于前端与外部系统判断单位与来源：

```
{
	"metric_distance": 50400,
	"metric_source": "bucket:0",
	"metric_unit": "ms",
	"distance_meters": 731,
	"path_coordinates": [ [31.230444,121.473885], ..., [31.224434,121.476852] ]
}
```

这些变化的目标是消除度量单位与来源的歧义、提高 arc 长度计算的准确性，并给运维/开发人员更清晰的诊断线索。

