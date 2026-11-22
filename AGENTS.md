<!-- TRELLIS:START -->
# Trellis Instructions

These instructions are for AI assistants working in this project.

This project is managed by Trellis. The working knowledge you need lives under `.trellis/`:

- `.trellis/workflow.md` — development phases, when to create tasks, skill routing
- `.trellis/spec/` — package- and layer-scoped coding guidelines (read before writing code in a given layer)
- `.trellis/workspace/` — per-developer journals and session traces
- `.trellis/tasks/` — active and archived tasks (PRDs, research, jsonl context)

If a Trellis command is available on your platform (e.g. `/trellis:finish-work`, `/trellis:continue`), prefer it over manual steps. Not every platform exposes every command.

If you're using Codex or another agent-capable tool, additional project-scoped helpers may live in:
- `.agents/skills/` — reusable Trellis skills
- `.codex/agents/` — optional custom subagents

Managed by Trellis. Edits outside this block are preserved; edits inside may be overwritten by a future `trellis update`.

<!-- TRELLIS:END -->

# 项目协作规则

## 需求与资料

- 开工前先读 [项目规格](docs/robot_navigation_workbench_spec.md) 、[架构与目录](docs/ARCHITECTURE.md)和当前 Trellis 任务，核对现有实现。项目术语见 [GLOSSARY.md](GLOSSARY.md)，环境准备见 [README.md](README.md)。
- 新需求与已记录的范围、行为或验收标准冲突，或关键需求含义不清时，暂停受影响的工作。向维护者指出冲突的文档位置和实际影响，确认是否更新规格。若确认要变更，先更新对应文档，再恢复开发。规格允许的实现细节可以自主决定。
- 课程要求有疑问时，回查老师的实验指导 PPT 和课堂文稿，并注明依据。资料缺失或两份资料口径不一致时，请维护者确认。未随仓库提供的课程材料可向维护者索取。

## 开发与验收

- 按规格的 P0、P1、P2 顺序推进。先跑通静态场景中的 A*、小车控制、碰撞判断和前端操作，再加入动态障碍物、APF 和可复现实验，最后扩展改进方案与展示功能。每次交付一个可运行的增量，验证后继续。
- Python 后端负责仿真、算法、碰撞和实验指标。前端根据真实仿真状态渲染。对比方案使用相同场景、初始条件、随机种子和运动约束，保留碰撞、超时和被困的结果。
- 用能体现算法差异的场景验证改进。先解释环境和算法，再展示可复现的对比，并说明改进在哪些情况下有效以及仍有哪些限制。
- 前端从第一阶段就注意布局、层级和可读性。并排对跑是课堂的主画面，两张地图要保持同一视野和比例，并在投屏时看得清轨迹、状态和关键指标。单车详细视图用于讲解算法决策，详细参数和调试图层按需展开。
- 每阶段记录启动方式、实际运行及测试结果，以及当前限制。涉及算法时验证可复现性，涉及前端时检查实际页面和关键交互。
