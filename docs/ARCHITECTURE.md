# 项目结构与依赖边界

先从[项目规格](robot_navigation_workbench_spec.md)确认课程目标、阶段与验收标准。遇到需求冲突，按 [AGENTS.md](../AGENTS.md) 的规则处理。安装与启动说明见 [README](../README.md)，场景和实验术语见[术语表](../GLOSSARY.md)。

## 后端

| 目录 | 职责 |
| --- | --- |
| [`backend/app/simulation/`](../backend/app/simulation/) | 固定时间步、场景状态、运动学、碰撞与运行结束判定。可独立在 Python 中运行。 |
| [`backend/app/algorithms/`](../backend/app/algorithms/) | A*、APF 和后续方案。通过统一接口读取当前状态，返回路径或运动指令。仿真引擎负责执行和判定结果。 |
| [`backend/app/scenarios/`](../backend/app/scenarios/) | 场景预设、障碍物运动配置及种子。实时演示和批量实验共用同一套场景定义。 |
| [`backend/app/experiments/`](../backend/app/experiments/) | 运行对比实验、汇总指标、导出 CSV 与 JSON。与实时模式共用仿真引擎。 |
| [`backend/app/api/`](../backend/app/api/) 和 [`backend/app/schemas/`](../backend/app/schemas/) | REST 命令、WebSocket 快照及传输数据校验。API 将应用状态映射成供前端使用的数据。 |
| [`backend/tests/`](../backend/tests/) | 仿真、算法、可复现性及 API 行为的测试。P0 先验证无障碍到达和绕开障碍物。 |

仿真核心只认识算法的输入输出约定。由启动入口或实验运行器选定具体算法并交给仿真引擎，算法读取当前观测，不能直接改写场景、碰撞或实验结果。FastAPI 和传输 schema 留在接口边界，仿真和批量实验可以脱离服务器运行。

## 前端

| 目录 | 职责 |
| --- | --- |
| [`frontend/src/api/`](../frontend/src/api/) 和 [`frontend/src/types/`](../frontend/src/types/) | 后端命令、状态流及其 TypeScript 类型。 |
| [`frontend/src/hooks/`](../frontend/src/hooks/) | 会话控制、订阅和视图状态。 |
| [`frontend/src/canvas/`](../frontend/src/canvas/) | 地图、障碍物、小车和轨迹。单车视图与并排对跑复用画布。 |
| [`frontend/src/components/`](../frontend/src/components/) | 控件、状态、指标与实验对比图表。 |

React 组件消费接口层提供的状态。画布的坐标转换和插值只影响显示。小车位置、碰撞与指标来自后端。更换前端时可沿用后端 API 和无界面实验。增加算法时，从算法目录、接入配置和对应实验测试入手。

## 从 P0 开始

先读项目规格的「实施优先级」和「完成标准」。建立最小的 Python 仿真，从预设起点跑到终点，再接上 FastAPI 与 React/Konva，验证开始、暂停、重置和两条基础场景。动态障碍物、对跑、批量实验和改进方案按规格逐阶段加入。
