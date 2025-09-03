项目：基于可定制收缩层次（CCH）的限行约束动态最短路径

概述
本设计在现有 TJ_RoutingKit（RoutingKit）基础上，提出一种可扩展的架构，用于处理城市路网中基于时间窗、用户属性（如车牌）、区域与突发事件的限行约束。目标是在保持 CCH 高查询性能的同时，尽可能降低定制（customization）成本，支持实时性与多层次限行策略。

交付物
- `design.md`（本文件）
- `TODO_CCH_RESTRICTION.md`（任务清单）
- PoC：EdgeWeight + rule registry + simple mapper（小图验证）
- 集成实现分支 `feature/cch-restriction`（创建命令见下）

需求梳理（Checklist）
- [ ] 在 RoutingKit 中增加多维边权（EdgeWeight）以表达基础权、拥堵系数与限行掩码
- [ ] 设计并实现规则注册（rule registry）和用户属性到掩码的映射
- [ ] 实现权重映射器（Customization Mapper）用于将多维权重映射为标量
- [ ] 修改/扩展 CCH 的定制接口以支持按 mapper 定制或增量定制
- [ ] 实现时间窗预制缓存与 LRU 策略
- [ ] 编写单元测试、集成测试与性能基准脚本

设计细节
1) 数据模型
- EdgeWeight
  - float base_weight; // 基础静态权重（距离或时长）
  - float congestion; // 实时拥堵因子（0..1）
  - uint64_t restriction_mask; // 位掩码，表示被哪些规则限制

- Rule Registry
  - 每条限行规则分配一个 bit index
  - 支持按时间窗、车牌尾号、车辆类型、区域等编码

- UserContext
  - 当前时间、车牌信息、用户偏好（避免收费/偏好高速）
  - 生成 user_mask（位掩码）和偏好参数

2) Customization Mapper（关键接口）
- 作用：将 EdgeWeight 映射为 float 标量供 CCH 定制使用
- API 草案：
  - `std::function<float(const EdgeWeight&)> make_mapper(const UserContext& ctx)`
  - 或者 `void map_weights(const std::vector<EdgeWeight>& in, std::vector<float>& out, const UserContext& ctx)`
- 映射逻辑示例：
  - if (edge.restriction_mask & ctx.user_mask) return INF;
  - else return edge.base_weight * (1.0f + alpha * edge.congestion) * preference_scale;

3) CCH 集成点
- 预处理（preprocessing）：仅基于拓扑与 base 权重计算收缩顺序和必要结构（尽量与权重无关）
- 定制（customization）：接受一个 mapper 或按边标量数组进行定制；实现增量定制（只针对有变化或受影响的区域）以降低开销
- 查询（query）：与现有 CCH 查询接口兼容，调用前保证相应定制已完成或可在线临时屏蔽受限边

4) 缓存策略
- 预制时间窗：对典型时间窗（常态/早高峰/晚高峰/节假日）预先计算并缓存定制结果
- LRU 缓存：对最近使用的 user_ctx（或时间窗组合）保留定制副本
- 增量补丁：对实时事件只存储受影响边的变动并在查询时合并

5) 并行与性能优化
- 并行化定制计算（分区并行），并尽量利用局部性仅更新局部 CH 数据
- 对 mapper 的计算使用矢量化或批处理（map_weights 接口）以减少调用开销

实现任务（按优先级）
1. PoC：EdgeWeight、rule registry、make_mapper、在小合成图上验证正确性（2 周）
2. 修改 CCH 接口以接受按边权标量数组（或 mapper），实现全量定制调用（3 周）
3. 实现增量定制：受影响边检测与局部定制（3 周）
4. 增加时间窗缓存与 LRU 策略（2 周）
5. 并行化与性能优化（2 周）
6. 集成测试、基准与文档（2 周）

实验与评估
- 数据：使用 `taiwan-latest.osm.pbf` 进行区域级实验，必要时下载多城市 PBF
- 基线：原生 CCH（静态，不含限行）与完全重定制的方法
- 指标：查询延迟（avg/P95/P99）、定制时间、吞吐（qps）、内存占用、正确性（是否避开限行）
- 场景：常态时间窗、时间窗切换、突发事件（封路）、用户分组并发查询

风险与缓解
- 多维权重导致定制开销高 → 使用时间窗缓存与增量定制
- 内存开销大 → 采用压缩、差分存储与只缓存热门时间窗/用户组
- 修改底层风险大 → 所有改动在 feature 分支，拆小 PR，增加 CI

分支与初始命令
- 建议在本地创建开发分支并推送：
```bash
cd /home/dyx131313/TJ_RoutingKit
git checkout -b feature/cch-restriction
git push -u origin feature/cch-restriction
```

下一步（建议）
- 我可以继续：
  - B1: 在 `feature/cch-restriction` 上实现 PoC（EdgeWeight + registry + mapper）并运行小图测试
  - B2: 提取 `使用手册.pdf` 中 CCH 定制与部分定制章节要点，映射到实现细节

结束语
已将设计概要与任务清单写入 `design.md`，下一步请确认是否要我继续实现 PoC（我会直接在仓库创建分支并提交代码骨架）。
