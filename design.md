
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

