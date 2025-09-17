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

## RoutingKit 文档与引用

RoutingKit 原生文档与学术引用见 docs/ 与下方链接：

* [Setup and Installation](doc/Setup.md)
* [Support Functionality](doc/SupportFunctions.md)
* [Contraction Hierarchy](doc/ContractionHierarchy.md)
* [Customizable Contraction Hierarchy](doc/CustomizableContractionHierarchy.md)
* [OpenStreetMap Importer](doc/OpenStreetMap.md)
* [Converting Coordinates to Node ID](doc/CoordinatesToNodeID.md)

如用于学术发表，请引用 RoutingKit 相关论文。
