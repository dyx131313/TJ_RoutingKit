# 快速启动指南

本文档适用于已完成环境搭建的用户。如果你还没有配置好开发环境，请先参阅 [README.md](../README.md) 中的完整安装说明。

## 环境要求

在开始之前，请确保已完成以下环境配置：

- Node.js 20.x + npm
- Redis 服务
- C++ 编译环境
- 项目依赖已安装

## 启动步骤

你需要启动 **4 个服务** 才能完整运行项目。建议按以下顺序启动：

---

### 1. 启动 Redis

```bash
# 检查 Redis 是否已运行
redis-cli ping
# 预期输出：PONG

# 如果未运行，启动 Redis
redis-server &
```

**端口**: 6379

---

### 2. 启动 C++ 路由服务

```bash
cd TJ_RoutingKit/app_backend

# 编译（如果需要）
make

# 启动路由服务（需要指定 PBF 数据文件）
./routing_server --pbf ../data/shanghai-250916.osm.pbf --profiles normal,morning_peak,evening_peak,walking,bus --use-perfect-witness true
```

**端口**: 12345

首次启动会自动加载 CCH 索引和地图数据。

如果当前数据集上 perfect witness 构建失败，服务会自动降级为普通 CCH，并把状态写入 `cache/<pbf-hash>/perfect_witness_status.txt`。后续启动会读取该状态并跳过重复失败构建。

如需手动重试构建：

```bash
./routing_server --pbf ../data/shanghai-250916.osm.pbf --use-perfect-witness true --force-rebuild-perfect-witness true
```

---

### 3. 启动 Node.js API 服务

```bash
cd TJ_RoutingKit/app_node

# 使用 nvm 切换到 Node.js 20
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 20

# 启动 API 服务
npm run start
```

**端口**: 3000

---

### 4. 启动前端开发服务器

```bash
cd TJ_RoutingKit/app_frontend_v2

# 使用 nvm 切换到 Node.js 20
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 20

# 启动开发服务器
npm run dev
```

**端口**: 5173

---

## 验证服务状态

启动完成后，打开浏览器访问：

```
http://localhost:5173
```

如果看到地图界面，说明所有服务已成功启动。

### 检查各服务健康状态

| 服务 | 地址 | 检查方式 |
|------|------|----------|
| Redis | localhost:6379 | `redis-cli ping` → PONG |
| API | localhost:3000 | `curl http://localhost:3000/api/health` |
| 路由服务 | localhost:12345 | telnet 或 API 调用测试 |
| 前端 | localhost:5173 | 浏览器访问 |

---

## 快速重启命令

以后每次启动项目，只需运行以下命令：

```bash
# 终端 1: Redis
redis-server &

# 终端 2: C++ 路由服务
cd TJ_RoutingKit/app_backend && ./routing_server --pbf ../data/shanghai-250916.osm.pbf --profiles normal,morning_peak,evening_peak,walking,bus --use-perfect-witness true

# 终端 3: Node.js API
cd TJ_RoutingKit/app_node && nvm use 20 && npm run start

# 终端 4: 前端
cd TJ_RoutingKit/app_frontend_v2 && nvm use 20 && npm run dev
```

---

## 常见问题

### 前端提示 Node.js 版本过低

确保使用 Node.js 20.x：
```bash
nvm use 20
npm run dev
```

### Redis 连接失败

检查 Redis 是否启动：
```bash
redis-server &
redis-cli ping
```

### 路由服务启动缓慢

首次启动需要加载 CCH 索引（约 20-30 秒），请耐心等待。

### 一键验收（P0/P1/P3）

服务启动后可执行：

```bash
cd TJ_RoutingKit
./tools/acceptance_p0_p1_p3.sh
```

脚本会验证：
- 路由缓存 flush 接口
- normal/walking/bus 三种 profile 查询
- 增量更新接口 `/api/graph/update_weights`
- 车牌策略命中/未命中行为
- 路由缓存基本命中回归

---

## 下一步

- 查看 [API 文档](./api.md) 了解接口详情
- 查看 [前端文档](./frontend.md) 了解组件结构
- 查看 [阶段总结](./progress-summary-2026-03.md) 了解当前完成情况与边界
