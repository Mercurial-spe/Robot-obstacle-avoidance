# Robot Navigation Workbench

《智能机器人技术》实验一「机器人避障」的二维仿真工作台。设定起点和终点，让小车在静态与动态障碍物之间自主行驶，再用相同场景比较算法的安全性和到达表现。

## 项目结构

当前仓库已建立目录骨架。前后端脚手架和依赖会随 P0 建立。

- [项目规格](docs/robot_navigation_workbench_spec.md)说明课程要求、开发阶段与验收标准。
- [架构与目录](docs/ARCHITECTURE.md)说明仿真、算法、实验、API 和前端的职责。
- [项目术语](GLOSSARY.md)说明场景、实验运行和避障成功的含义。

先跑通静态场景的 A* 和真实运动，再加入动态障碍物、人工势场法和可复现的对比实验。后端负责仿真状态与实验指标。前端负责场景操作、轨迹和算法决策的可视化。

## 项目开发环境

- Git
- Python 3.11 或更高版本和 `uv`
- Node.js 24 LTS 和 npm

后端依赖由 `backend/pyproject.toml` 与 `backend/uv.lock` 管理，前端依赖由 `frontend/package.json` 与 `frontend/package-lock.json` 管理。应用脚手架完成后，在两个终端分别运行以下命令。

```sh
cd backend
uv sync
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

```sh
cd frontend
npm ci
npm run dev
```

## 使用 Agent 开发

常规项目开发和运行可以直接使用上面的工具。使用 Codex 等 Coding Agent 协作时，从 [AGENTS.md](AGENTS.md) 和 [.trellis/workflow.md](.trellis/workflow.md) 开始。仓库包含 Trellis 的项目配置、规格索引及 Codex 接入文件，可安装对应版本的 CLI。

```sh
npm install -g @mindfoldhq/trellis@0.6.17
trellis --version
```

开发前阅读项目规格和当前任务记录。发现新需求与已记录的需求不一致，或对要求的含义无法达成一致时，**暂停受影响的开发，先和维护者确认是否更新文档**。确认后先更新规格或任务记录，再继续实现。对课程要求仍有疑问时，以老师的实验指导 PPT 和课堂文稿为准。

## 课程资料

课堂资料位于维护者的本地 `docs/ppt/` 和 `docs/curriculum_audio_catch/`。超过 10 MB 的文件已被 Git 忽略。若克隆后需要实验指导 PPT、课程课件或课堂文稿，请直接向仓库维护者索取。重点查阅「实验一、机器人避障」「实验要求」和第 8 份课堂转写。
