# Journal - robot (Part 1)

> AI development session journal
> Started: 2026-11-22

---



## Session 1: 建立机器人避障工作台目录
<!-- trellis-session: v=2 fp=3c6edfbdbc31b82f -->

**Date**: 2026-11-22
**Task**: 建立机器人避障工作台目录
**Branch**: `main`

### Summary

建立前后端目录和架构说明，记录 Agent 入口、课程依据和展示约定。检查文档链接、目录和任务上下文。

### Git Commits

| Hash | Message |
|------|---------|
| `83d6814` | docs: scaffold navigation workbench structure |

### Status

[OK] **Completed**


## Session 2: P0 可运行闭环：规范补全与全栈实现
<!-- trellis-session: v=2 fp=73a0127db2b51193 -->

**Date**: 2026-11-22
**Task**: P0 可运行闭环：规范补全与全栈实现
**Branch**: `main`

### Summary

补全 .trellis/spec 前后端规范并归档 bootstrap 任务；实现 P0：固定时间步仿真引擎、A* 规划+waypoint 控制、FastAPI REST/WS 会话 API、React/Konva 深色工作台前端。uv run pytest 4 通过；npm run build 通过；实时 WS 全程运行 reached_goal（14.7s 仿真、16.56m、0 碰撞）。踩坑记录：FastAPI 路由模块禁用 from __future__ import annotations；国内网络 uv sync 需镜像源。

### Git Commits

| Hash | Message |
|------|---------|
| `3ebef79` | feat(frontend): add Konva workbench UI with session control |

### Status

[OK] **Completed**


## Session 3: P1+P2 全系统：多智能体实现
<!-- trellis-session: v=2 fp=357285f5a287a05b -->

**Date**: 2026-11-23
**Task**: P1+P2 全系统：多智能体实现
**Branch**: `main`

### Summary

6 子代理工作流完成 P1+P2：动态障碍物（往返/折线、子步碰撞）、dynamic-crossing/mixed-corridor 场景、A* 重规划、APF（局部极小诚实记录）、Hybrid（触发条件文档化）、批量实验 CSV/JSON 导出、并排对跑/单车详情/场景编辑/图层/Recharts 仪表盘。验证代理修复 3 个问题；独立复核 uv run pytest 44 通过、npm run build 通过、3 算法×3 种子批量实验全链路成功并导出。

### Git Commits

| Hash | Message |
|------|---------|
| `2d2b27f` | docs: rewrite README for the full workbench |

### Status

[OK] **Completed**
