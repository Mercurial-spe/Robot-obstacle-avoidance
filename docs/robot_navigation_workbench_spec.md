# Robot Navigation Workbench — Agent 开发规格（v1.0）

> **项目性质**：智能机器人技术课程实验一「机器人避障」  
> **目标**：搭建一个美观、可交互、可复现实验的二维机器人避障仿真平台，比较多种路径规划 / 避障算法。  
> **开发方式**：优先使用 Coding Agent 实现；先交付完整、可靠的 MVP，再逐步增加表现力。  
> **课堂演示**：2026-11-27；**实验报告**：2026-12-07。

## 1. 课程要求与产品目标

必须满足：

1. 建立一个二维场景，同时包含**静态障碍物**和**动态障碍物**；设置机器人起点和终点。
2. 机器人根据算法控制自身运动，安全到达目标；不得用预先生成的轨迹动画冒充控制与仿真。
3. 实现**至少两种**路径规划 / 避障算法，并在相同条件下比较效果。
4. 提供可运行源码、直观演示、量化实验结果与可复现配置，方便撰写报告。

推荐实现 **A*、人工势场法（APF）和 A* + APF Hybrid**。其中 Hybrid 可作为扩展与改进方向，需与基线进行公平比较。

**范围边界**：本项目研究二维导航，不需要 3D 图形、Webots、ROS、SLAM、深度学习、真实硬件或复杂车辆动力学；但需要合理的二维运动学、碰撞检测和动态障碍物模拟。

## 2. 确定技术栈

### 前端（`frontend/`）

- **React + TypeScript + Vite**：应用框架、构建和开发服务器。
- **React Konva (`react-konva` + `konva`)**：主仿真画布；绘制地图、机器人、障碍物、规划路径、实际轨迹和可视化图层；支持拖拽编辑。
- **Tailwind CSS + shadcn/ui**：界面样式与控制面板组件。统一设计 token，避免堆砌无关组件。
- **Recharts**：性能指标和算法对比图表。
- **Motion (`motion/react`)**：面板切换、状态反馈等适量 UI 动效；机器人运动由仿真状态驱动，不由 CSS 动画驱动。
- **Lucide React**：图标。
- 推荐 **Vitest** 测试前端纯逻辑；**Playwright** 做关键 UI 冒烟测试（可在 MVP 后添加）。

### 后端（`backend/`）

- **Python 3.11+**，依赖与运行环境由 **`uv`** 管理（保留 `pyproject.toml` 与 `uv.lock`）。
- **FastAPI + Uvicorn**：提供 REST API 和 WebSocket 实时状态流。
- **Pydantic**：API 请求 / 响应、场景及实验参数的数据校验。
- **NumPy**：基础几何、数值计算。仅在算法确有必要时增加 SciPy，不要为了小项目引入复杂 ML 框架。
- **pytest**：算法、碰撞检测、运动学和批量实验的单元 / 集成测试。
- 结果导出：标准库 `csv` / `json` 即可。

**Agent Skills（如已配置）**：优先使用 `frontend-design` 负责设计，`web-design-guidelines` 审查交互与可用性，`vercel-react-best-practices` 检查 React 结构与性能。不要让 Skill 改写下述仿真正确性约束。

## 3. 架构原则

**后端是仿真状态的唯一真相来源（single source of truth）**：地图、机器人位置、速度、碰撞、算法决策、动态障碍物位置、实验计时与评价指标均由 Python 计算。前端只展示状态并发送命令。

```text
React UI + Konva canvas + Charts
              |
       REST / WebSocket
              |
   FastAPI (session & experiment API)
              |
 Python simulation engine (fixed timestep)
     |            |           |
  Robot model   World &      Planners
  & controller  collision   A* / APF / Hybrid
              |
     metrics / CSV / JSON
```

- **仿真逻辑与服务器解耦**：核心 Simulation Engine 应可由 Python 脚本 / pytest 直接运行，不依赖 FastAPI、浏览器或实时等待。
- **固定时间步**：例如 `dt = 0.05 s`（20 Hz）；实时模式按 wall-clock 调度，批量实验则尽快执行相同步数。
- **前端刷新率与仿真帧率分离**：通过 WebSocket 发送约 10–20 Hz 状态快照，前端可插值显示；不要每帧重渲染完整 React 组件树。
- **可复现性**：随机地图、障碍物移动和实验种子都记录 `seed`。算法对比使用相同场景、机器人参数、初始条件和预算。
- **单位统一**：内部坐标使用米、秒、弧度；前端负责映射至画布像素。

## 4. 仿真模型（必要的技术深度）

### 4.1 机器人

使用具有半径 `r` 的二维圆形差速轮机器人；以简化的 unicycle 运动学建模：

```text
x_next     = x + v * cos(theta) * dt
 y_next    = y + v * sin(theta) * dt
 theta_next = wrap(theta + omega * dt)
```

- 控制器输出线速度 `v` 与角速度 `omega`，并施加最大速度 / 转向角速度限制。
- 机器人有朝向，不能瞬间横移或跳跃；沿路径行走需要一个通用 waypoint-following controller。
- 每一步更新做边界检查、机器人与障碍物的**带半径碰撞检测**；对高速穿越或细障碍物，使用子步进或运动段碰撞检测，避免穿模。
- 到达终点条件：机器人中心到目标的距离小于可配置阈值，并且未碰撞；有超时和被困判定。

### 4.2 障碍物与场景

- 静态障碍物：圆形和轴对齐矩形（MVP 可以先支持矩形 + 圆形）。
- 动态障碍物：至少一种可重复运动模式（水平往返、垂直往返或预设折线），固定时间步更新；边界反弹逻辑可选。
- 提供至少三个内置场景：**静态基础**、**动态交叉**、**静动态混合 / 狭窄通道**。
- 支持通过 UI 添加、拖动、删除障碍物，更改起点 / 终点；Reset 后能还原初始条件。
- 可使用环境中障碍物的真实位置作为第一版算法输入，明确称为 **full-state observation**。未来可扩展有限探测半径 / 传感器噪声，但本版不强制。

### 4.3 算法

定义统一算法接口：输入机器人状态、目标、地图 / 当前障碍物状态；输出控制命令或目标路径。不同算法共用**同一个**运动控制和碰撞检测系统。

1. **A***：构建二维占据栅格，对障碍物按机器人半径 + 安全余量进行膨胀；搜索路径，进行必要的路径简化，使用 waypoint follower 执行。在动态场景中根据固定重规划规则更新路径，并单独记录重规划次数和计算时间。
2. **APF**：目标吸引力 + 障碍物排斥力，转换为机器人允许的 `(v, omega)`；防止无限速度；明确记录局部极小值 / 原地振荡 / 超时情形，不能偷偷将失败改成成功。
3. **Hybrid（扩展）**：A* 提供全局路线 / 中间航点，APF 负责局部动态避障；必要时触发 A* 重规划。写清触发条件、调参和为何可能优于基线。

**公平性**：三种算法在同一场景使用同样的机器人半径、速度上限、可用环境信息、碰撞规则和目标条件。算法可采用不同策略，但不允许某个算法直接读取未来障碍物位置而其他算法不允许。

### 4.4 指标

必需：是否到达、碰撞次数、实际行驶距离、仿真耗时、规划计算耗时。推荐补充：重规划次数、最小障碍物间距、超时 / 被困数量。至少在多个随机 seed 下报告成功率与均值；输出 CSV / JSON。

## 5. UI / UX 设计要求

视觉目标：**Robotics Research Workbench / 科研仪表盘**，干净、专业、精致，避免游戏化或套模板感。默认深色方案，深蓝 / 石墨灰底，路径与机器人使用少量高对比强调色。简洁字体、统一间距、清晰层级、细致 hover / focus 状态；动画克制。

**推荐桌面布局**：

- 顶部：项目名称、场景选择、运行 / 暂停 / 单步 / 重置、仿真速度。
- 左侧：算法选择、静态 / 动态场景、地图编辑工具。
- 中心（最大区域）：Konva 2D 地图，支持缩放、平移、拖拽障碍物、设置起终点。
- 右侧：算法参数、安全半径、速度限制、实时状态 / 事件信息。
- 底部：实验指标卡片、轨迹 / 耗时 / 成功率对比图、最近一次实验日志。

**独立可切换可视化图层**：障碍物 / 膨胀区、A* 栅格与搜索节点、规划路径、实际轨迹、机器人朝向、动态障碍物速度方向、APF 力箭头 / 局部势场（后者可放在第二阶段）。显示图例；画布缩放时线宽与控件大小合理。

交互要求：拖动地图元素后需要停止或重置当前实验（除非明确实现在线场景编辑）；出现不可达地图时提示原因，不应卡死。前端需要响应式布局，但优先保证课堂展示时的桌面宽屏体验。

## 6. API 建议（可根据实现简化）

REST：

- `GET /api/health`：健康检查。
- `GET /api/scenarios`：预设场景。
- `POST /api/sessions`：按场景、算法、参数与 seed 创建 / 重置仿真。
- `POST /api/sessions/{id}/commands`：`start`、`pause`、`step`、`reset`。
- `PUT /api/sessions/{id}/scene`：更新地图、障碍物、起终点（仅在暂停 / 重置状态下）。
- `POST /api/experiments/batch`：运行无界面的批量实验，返回汇总指标与下载文件位置或数据。

WebSocket：

- `WS /api/sessions/{id}/stream`：推送机器人姿态、障碍物位置、规划路径、轨迹增量、当前状态和实时指标。

使用明确的 Pydantic schema；统一事件名、时间戳与错误结构。前端 API 客户端单独封装，必要时从 OpenAPI 生成 TS 类型。

## 7. 推荐仓库结构

```text
robot-navigation-workbench/
├── README.md
├── docs/
│   └── ARCHITECTURE.md
├── backend/
│   ├── pyproject.toml
│   ├── uv.lock
│   ├── app/
│   │   ├── main.py             # FastAPI
│   │   ├── api/                # REST / WS 路由
│   │   ├── schemas/            # Pydantic models
│   │   ├── simulation/         # world, robot, stepping, collision
│   │   ├── algorithms/         # astar, apf, hybrid
│   │   ├── scenarios/          # presets, procedural maps
│   │   └── experiments/        # runners, metrics, export
│   └── tests/
├── frontend/
│   ├── package.json
│   └── src/
│       ├── components/         # controls, telemetry, charts
│       ├── canvas/             # Konva scene and visualization layers
│       ├── hooks/
│       ├── api/
│       ├── types/
│       └── App.tsx
└── scripts/                    # 跨平台启动 / 测试脚本（可选）
```

## 8. 开发与运行约定

后端：

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

前端：

```bash
cd frontend
npm install
npm run dev
```

开发环境允许前端 `http://localhost:5173` 访问本地后端 `http://127.0.0.1:8000`，正确配置 CORS 与 WebSocket 地址；前端用 `VITE_API_BASE_URL` 配置后端地址。固定依赖版本并提交锁文件。确保 Windows 与 macOS 均可运行，不依赖平台特有 shell 语法。

如果从空仓库初始化：前端使用 Vite 的 `react-ts` 模板，安装 React Konva、Tailwind、shadcn/ui、Recharts、Motion、Lucide；后端以 `uv init` 初始化并添加 FastAPI、Uvicorn、Pydantic、NumPy、pytest。优先遵循各库**当前官方**安装指南，避免硬编码已过时的脚手架命令。

## 9. 实施优先级（严格按顺序）

### P0 — 可运行闭环（必须先完成）

- React 页面 + Konva 地图能正常显示；Python FastAPI 正常启动并推送状态。
- 一个机器人、静态障碍物、起点 / 终点、真实运动学与碰撞检测。
- A* 能规划并通过控制器实际到达目标；页面能开始、暂停、重置。
- 至少具备两个基础测试：无障碍到达、障碍物阻挡绕行。

### P1 — 满足课程实验要求

- 加入动态障碍物、APF 算法、至少一个动态场景。
- 加入算法对比、指标统计、批量 seed 运行、CSV / JSON 导出。
- 明确算法失败与碰撞的处理机制；准备可信演示场景。

### P2 — 展示效果与创新

- A* + APF Hybrid、实时编辑、参数面板、完整可视化图层。
- Recharts 实验图表、场景预设、美观的设计系统、微动效。
- 可选增加传感器视野限制、避障失败分析、实验日志重放。

**不要在 P0 稳定前花大量时间制作 UI 动画或高级功能。**

## 10. 完成标准（Definition of Done）

- [ ] 在 macOS / Windows 上按 README 的命令可以启动前后端。
- [ ] 浏览器能够看到真实仿真过程，支持开始、暂停、重置与算法切换。
- [ ] 含静态和移动障碍物的多个场景都可以运行。
- [ ] 至少两种算法真实运行、共享相同仿真模型，可以公平比较。
- [ ] 障碍物碰撞与边界检测不会因为画面帧率变化而改变结果。
- [ ] 批量实验固定 seed 可复现；碰撞、未到达、超时都有明确记录。
- [ ] 能导出结果，并展示至少一张对比图表。
- [ ] `uv run pytest` 等后端测试通过；前端构建与关键交互检查通过。
- [ ] README 写清架构、安装、运行、操作、算法与实验复现步骤。

## 11. 给 Coding Agent 的工作准则

1. **先检查现有仓库**，没有代码再初始化；不要擅自替换已存在的技术栈。
2. 从端到端的最小闭环开始，一次完成可运行的增量，执行测试后再继续。
3. **算法和仿真必须在 Python 后端**，React 只做渲染与操作；不要维护相互矛盾的两套物理状态。
4. 不得用 CSS / Canvas 关键帧动画伪造算法运动、避障结果或性能数据。
5. 先确保随机种子、碰撞处理、运动模型与对比指标正确，再打磨交互体验。
6. 使用 `frontend-design` 构建有辨识度的视觉设计，但不要添加与实验无关的装饰性模块。
7. 每一阶段交付：已实现功能、实际运行方式、测试结果、尚未解决的问题；出现依赖阻塞时给出最小替代方案。
8. 不需要先征询大量细节；在上述边界内自主选择合理默认值，并在 README 记录关键决策。

**最终交付物**：完整源码仓库、启动说明、至少三种场景、至少两种算法、真实运行演示、可导出的实验数据及面向课堂汇报的清晰 UI。
