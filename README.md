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

## Recent Changes (short)

Recent updates clarify metric semantics and improve diagnostics:
- Backend now returns explicit `metric_unit` and `metric_source` in route JSON responses to avoid ambiguity between geometric distance and metric weight.
- Backend computes both `distance_meters` (Haversine over node coordinates) and, when available, `geo_distance_arcs_meters` by summing `graph.geo_distance` along the arc path returned by the query.
- Node gateway (`app_node/index.js`) logs `metric_unit`/`metric_source` and forwards backend JSON unchanged.
- Frontend (`app_frontend/js/controls.js`) displays `metric_distance` with unit-aware formatting (e.g. shows ms and converted seconds when `metric_unit` is `ms`).

See `doc/metric-units.md` for detailed explanation and verification commands.
```

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
