# TJ_RoutingKit 离线地图路由工程

## 项目简介

本仓库集成了高性能 C++ 路由算法库（RoutingKit）与完整的离线地图 Web 应用。
支持 OSM PBF 数据解析、离线瓦片地图展示、路径规划 API、交通模式切换等功能。

## 目录结构

- app_backend/      C++ 路由服务（TCP服务器，路径计算）
- app_node/         Node.js 服务（API转发，静态文件服务）
- app_frontend/     前端页面（地图展示与交互）
- tiles/            离线地图瓦片（本地加载，无需外网）
- data/             OSM PBF 数据（如上海、台湾等）
- bin/ build/ src/  RoutingKit 算法库及工具

## 快速启动（详细）

下面列出从克隆仓库到在本地运行前端与后端的完整步骤，包括编译 RoutingKit 库的指令。假设在一台 Linux 机器上，已安装常见开发工具（`git`, `build-essential`, `cmake`, `python3`, `node`, `npm` 等）。

1) 克隆仓库

```bash
git clone <REPO_URL> TJ_RoutingKit
cd TJ_RoutingKit
```

2) 安装系统依赖（Ubuntu/Debian 示例）

```bash
sudo apt update
sudo apt install -y build-essential cmake pkg-config libboost-all-dev libssl-dev libbz2-dev zlib1g-dev git python3 python3-pip nodejs npm
```

3) 编译并安装 RoutingKit（项目内包含源码子目录 `src/` 和 `bin/` 工具）

说明：RoutingKit 需要编译为库以供 `app_backend` 链接。仓库已包含用于生成 Makefile 的脚本。

```bash
# 进入仓库根目录
./generate_make_file > Makefile
make -j$(nproc)
# 编译产物位于 bin/ 和 lib/ 下（确保 lib/ 在链接时可见）
```

4) 编译 C++ 后端

```bash
cd app_backend
make -j$(nproc)
# 生成可执行文件： app_backend/routing_server
```

5) 准备 PBF 数据和缓存目录

把 OSM PBF 文件放到 `data/` 下，例如：

```bash
cp /path/to/shanghai-250916.osm.pbf data/
```

首次运行时后端会加载 PBF 并构建/加载 CCH 缓存到 `cache/<pbf-hash>/`。建议确保 `cache/` 目录在 `.gitignore` 中被忽略（仓库已做此处理）。

6) 启动 C++ 后端（示例）

```bash
# 在 app_backend 下启动，监听默认 TCP 12345
./routing_server --pbf ../data/shanghai-250916.osm.pbf --bucket-minutes 30 --buckets 3 &> routing_server.log &
tail -f routing_server.log
```

## Recent Changes (short)

最近更新聚焦于度量语义明确化、预览影响的完整展示与稳定性：
- 路由响应新增并统一了 `metric_unit` 与 `metric_source` 字段，避免将“几何距离”与“度量权重”混淆；同时返回更贴近物理距离的 `distance_meters`，以及（可用时）沿弧累加的 `geo_distance_arcs_meters`。
- 预览影响（模板/多边形）端到端移除了“最多 500 条弧”的上限，前端会绘制所有受影响弧。
- C++ 后端 RESOLVE_POLY 修复了个别场景下的“飞线”问题，并新增受影响弧数量日志，便于核对。
- 新增“预览判定策略”并在结果 JSON 中返回 `policy` 字段；Node 在读取旧缓存且策略不匹配时会自动重算并更新缓存。

7) 启动 Node.js 网关

```bash
cd ../app_node
npm install
node index.js &> node.log &
tail -f node.log
```

8) 访问前端页面

在浏览器打开：

```
http://localhost:3000/index.html
```

9) 常用命令示例

- 获取后端 INFO（在开发或调试中很有用）：

```bash
echo "INFO" | nc 127.0.0.1 12345
```

- 路由（通过 Node）：

```bash
curl "http://127.0.0.1:3000/route?from=LAT1,LON1&to=LAT2,LON2"
```

- 生成模板度量并应用（Node 提供的接口）：

```bash
curl -X POST http://127.0.0.1:3000/api/templates/<sig>/build
curl "http://127.0.0.1:3000/route?from=LAT1,LON1&to=LAT2,LON2&metric_sig=<sig>"
```

10) 常见问题和提示

- 构建过程中若遇到 OpenSSL deprecation 警告为正常（使用系统 OpenSSL 3）；警告不影响运行。
- 若路由后端启动很慢，检查 `routing_server.log` 中 CCH 加载和定制化日志。
- 如果需要调试 metric 是否应用，请检查 `cache/<pbf-hash>/metric_sig_<sig>.bin` 是否存在，以及 Node 使用 `INFO` 获取的 `travel_time` 数量是否与生成的权重数一致。

如需把流程脚本化（自动构建/启动/测试），我可以把上面的步骤制作成 `scripts/setup.sh` 与 `scripts/run_tests.sh` 两个脚本并提交到仓库。

## 离线地图与路径规划

- 地图瓦片全部本地加载，前端无需外网。
- 支持多种交通模式（正常/早高峰/晚高峰）切换。
- 路径查询结果实时展示于地图。

## 已实现的新特性（模板与度量）

本项目已实现一套用于表达“限行/偏好模板”的机制，配合 Node 网关和 C++ 后端可在查询时应用自定义度量：

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
curl "http://127.0.0.1:3000/route?from=LAT1,LON1&to=LAT2,LON2&metric_sig=<sig>"
```

度量系统已在本地开发环境完成端到端验证：Node 生成的 `metric_sig` 能被 C++ 后端识别并影响路由结果。

## RoutingKit 文档与引用

RoutingKit 原生文档与学术引用见 docs/ 与下方链接：

* [Setup and Installation](doc/Setup.md)
* [Support Functionality](doc/SupportFunctions.md)
* [Contraction Hierarchy](doc/ContractionHierarchy.md)
* [Customizable Contraction Hierarchy](doc/CustomizableContractionHierarchy.md)
* [OpenStreetMap Importer](doc/OpenStreetMap.md)
* [Converting Coordinates to Node ID](doc/CoordinatesToNodeID.md)

如用于学术发表，请引用 RoutingKit 相关论文。

---

## 预览影响（Polygon / Template）

本项目支持在前端绘制多边形并“预览影响”的弧段，或对已保存的模板进行预览。

- 判定策略（policy）：自 2025-10 起，RESOLVE_POLY 采用 `both_inside` 策略，即“仅当一条弧的两个端点都位于多边形内部时，该弧计为受影响”。
	- 后端响应示例（字段节选）：
		```json
		{ "policy": "both_inside", "arc_count": 14364, "arc_ids": [...], "arc_coords": [{"arc":123,"u":[lat,lon],"v":[lat,lon]} ...] }
		```
	- Node 网关在读取历史缓存时，如发现无 `policy` 或策略不为 `both_inside`，会自动请求后端重算并覆盖旧缓存。

- 缓存位置：`cache/<pbf-hash>/templates/resolve_poly_<sha256>.json`
	- Key 由多边形坐标（6 位小数）规范化后按顺序拼接并取 SHA-256 生成。
	- 如需手工清理缓存（例如切换策略后希望强制全量重算）：
		```bash
		rm -f cache/*/templates/resolve_poly_*.json
		```

- 前端交互要点：
	- “绘制 多边形”→“预览影响”→地图上以蓝色线段高亮所有受影响弧；
	- “取消绘制”会清理当前多边形以及各类预览图层；
	- 模板与规则面板已拆分为左右两侧互不遮挡，模板可一键预览/关闭。

## API 速览（Node 网关）

- 路由：`GET /route?from=lat,lon&to=lat,lon[&profile=normal|morning_peak|evening_peak][&metric_sig=<sig>|&rule_id=<id>]`
	- 透传到 C++ 服务，返回 JSON 包含 `metric_unit`, `metric_source`, `distance_meters`, `geo_distance_arcs_meters`（可用时）等。

- 最近点：`GET /nearest?lat=..&lon=..`

- 解析多边形预览：`POST /api/resolve_poly`
	- Body: `{ "polygon": [[lat,lon], [lat,lon], ...] }`
	- 返回含 `policy`, `arc_count`, `arc_ids`, `arc_coords`；带缓存（策略不匹配或历史截断会自动重算）。

- 模板：
	- `POST /api/templates` 保存模板（支持 `polygon` 或 `arc_ids` 或 `tag_filter`）
	- `GET /api/templates` 列表；`GET /api/templates/:sig` 详情
	- `GET /api/templates/:sig/preview` 预览（同样带缓存与自动重算）
	- `POST /api/templates/:sig/precompute` 对包含多边形/弧 ID 的模板预先解析
	- `POST /api/templates/:sig/build` 生成 `metric_sig_<sig>.bin`（用于查询的自定义度量）
	- `DELETE /api/templates/:sig` 移入回收站；`POST /api/templates/:sig/restore` 还原

- 规则：
	- `POST /api/rules` 创建规则（选择多个模板合并）
	- `GET /api/rules` / `GET /api/rules/:id` / `PUT /api/rules/:id` / `DELETE /api/rules/:id`
	- `POST /api/rules/:id/build` 为规则构建并导出合并度量文件（同时提供 `metric_sig` 别名）

## 调试与日志

- C++ 后端：
	- `INFO`：`echo "INFO" | nc 127.0.0.1 12345`
	- RESOLVE_POLY 在终端输出受影响弧数量日志：`RESOLVE_POLY affected_arcs count = N`
	- 若需核对“飞线/视角拉远”问题，优先确认后端版本包含 `both_inside` 策略与哨兵友好的 `first_out` 映射修复。

- Node 网关：
	- 对 route 结果会记录 `metric_unit` 与 `metric_source`；
	- 对 resolve_poly 遇到策略不匹配或历史截断会自动重算并覆盖缓存。

## 常见问题（Troubleshooting）

- 预览只显示 500 条弧：
	- 现版本已移除所有层面的 500 上限。如仍出现，多半是历史缓存命中；清理 `cache/*/templates/resolve_poly_*.json` 或等待 Node 自动重算（策略不匹配/截断会触发）。

- 预览出现两条很长的“飞线”：
	- 旧版本在弧索引 → 起点节点映射上存在边界处理问题；升级后端并重启，清理历史缓存后重试。

- Node 提示 C++ 不可达：
	- 检查 C++ 进程是否运行、是否监听 12345；确认 `cmd.sh`/`run.sh` 启动参数与 PBF 路径正确。

- metric 权重数量不匹配：
	- 使用 `INFO` 获取 `travel_time_count`，确认生成的 metric 长度一致；若不一致，重新生成度量文件。

## 开发提示

- 快速重编译 C++ 后端：
	```bash
	cd app_backend && make -j$(nproc)
	```
- 清理并重启后端（示例）：
	```bash
	pkill -f routing_server || true
	./app_backend/routing_server --pbf ./data/shanghai-250916.osm.pbf --bucket-minutes 30 --buckets 3 &> routing_server.log &
	tail -f routing_server.log
	```
- 清理预览缓存：
	```bash
	rm -f cache/*/templates/resolve_poly_*.json
	```
