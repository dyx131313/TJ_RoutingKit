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

## 快速启动

1. 编译并启动 C++ 路由服务
   ```bash
   cd app_backend
   make
   ./routing_server --pbf ../data/shanghai-250916.osm.pbf
   ```

2. 启动 Node.js 服务
   ```bash
   cd ../app_node
   npm install
   node index.js
   ```

3. 启动前端页面
   在浏览器访问：
   ```
   http://localhost:3000/index.html
   ```

## 一键启动脚本

项目根目录下提供了 `run.sh`，用于一键启动后端和 Node.js 服务：

```bash
chmod +x run.sh
./run.sh
```

在 `app_node/` 下还包含 `test_route.sh`，用于快速调用示例路径查询。

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
