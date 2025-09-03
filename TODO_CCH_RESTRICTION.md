TODO: CCH 限行支持 - 任务清单

目标：在 TJ_RoutingKit 中实现针对限行约束的可定制 CCH 方案，支持时间窗、用户属性（车牌、车型）、实时事件与用户偏好。

短期任务（PoC）
- [ ] 在 `include/routingkit/` 添加 `edge_weight.h` 定义 `EdgeWeight` 结构
- [ ] 实现 `tools/rule_registry.h/.cpp`：rule 注册与 user_ctx -> mask 映射
- [ ] 在 `tools/` 中添加 `mapper.h/.cpp`：实现 `make_mapper` 并提供 `map_weights` 批处理接口
- [ ] 编写 PoC 可执行文件 `tools/poc_restriction.cpp`，对小图进行读取并验证限行过滤
- [ ] 单元测试：`tests/test_mapper.cpp`

中期任务（CCH 集成）
- [ ] 修改 CCH 的定制接口，支持传入按边权标量数组
- [ ] 实现增量定制工具，检测受影响边并局部执行定制
- [ ] 实现时间窗缓存模块（`tools/cache_manager.h`）
- [ ] 性能基准脚本 `bench/bench_restriction.py`（或 C++）

长期任务（优化与工程化）
- [ ] 并行化定制与查询（多线程分区）
- [ ] 压缩/差分存储多套定制结果
- [ ] 集成 CI：性能基线检查、单元测试、代码风格
- [ ] 文档：开发手册、使用示例、论文实验复现脚本

里程碑（建议）
- M0：PoC 验证（功能正确）
- M1：完成 CCH 集成并能在中等图上运行
- M2：实现时间窗缓存与增量定制，性能比全量重定制优至少 4x
- M3：完成论文实验与报告

负责人/时间估算（粗略）
- PoC：2 周
- CCH 集成：3 周
- 缓存与优化：4 周
- 实验与写作：3 周

备注：所有改动在 feature 分支上开发，拆分为小 PR，保证主分支稳定。
