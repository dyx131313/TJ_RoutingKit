# TJ_RoutingKit 前端 (React + Vite + TypeScript)

## 技术栈

- **框架**: React 18 + TypeScript
- **构建工具**: Vite 5
- **UI 组件库**: Ant Design 5
- **地图**: react-leaflet + Leaflet
- **状态管理**: Zustand
- **HTTP 客户端**: Axios

## 快速启动

```bash
cd app_frontend_v2
npm install
npm run dev
```

访问 `http://localhost:5173`

## 项目结构

```
src/
├── components/       # React 组件
│   ├── Layout/      # 布局组件 (Header)
│   ├── Map/         # 地图组件 (MapView)
│   ├── Route/       # 路由组件 (RouteControls)
│   ├── Template/    # 模板管理组件
│   └── Rule/       # 规则管理组件
├── hooks/           # 自定义 Hooks
│   ├── useRoute.ts # 路由查询
│   └── useTemplates.ts
├── stores/          # Zustand 状态管理
├── services/        # API 服务
├── types/           # TypeScript 类型定义
└── App.tsx         # 主应用入口
```

## 主要功能

1. **地图展示** - 离线瓦片地图
2. **路径规划** - 支持多种交通模式
3. **模板管理** - 创建/编辑/删除限行区域模板
4. **规则管理** - 创建/应用交通规则
5. **预览影响** - 可视化限行区域影响

## 环境变量

开发环境默认连接：
- Node.js 网关: `http://localhost:3000`
- 如果需要修改，编辑 `src/services/api.ts` 中的 `BASE_URL`
