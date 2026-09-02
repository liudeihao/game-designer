# AI Game Studio · 游戏设计文档协作工作台

给游戏设计师用的本地 Agent 工作台：对话、计划和设计文档在同一块屏幕上，Agent 只写策划，不写工程。

通用聊天框没有工作区；通用编程 Agent 有工作区，但界面、工具和默认行为都是给写代码的人准备的。本项目把同一套「能读写文件的 Agent」收成设计师的工作环境——中文文档树、设计文档原则、Ask / Plan / Agent 三档权限，并将在后续提供根据设计文档用AI生成角色设计图、世界概念图等。

- 后端：Python 3.11+ / FastAPI / LangGraph
- 前端：React 18 / TypeScript / Vite / Tailwind CSS 4
- 模型：任意 OpenAI 兼容接口（OpenAI、DeepSeek、Kimi、通义……）

---

## 它解决什么

设计师写策划案时，常见有两条路：

1. **通用聊天工具**（ChatGPT、DeepSeek 网页）。没有工作区，产出停在气泡里，改十次粘十次，长对话还会忘掉前面定好的世界观和数值口径。
2. **通用 Agent**（Cursor、Claude Code 一类）。已经有工作区、上下文和工具调用，但默认环境是代码仓库：终端、diff、工程文件名。让它写 `角色设计.md`，它仍可能滑向实现方案；让主美只读查询，也没有「绝不动文件」的硬隔离。更关键的是，这类工具很难自然地长出设计师真正需要的下一步——在角色文档旁生成立绘、在音效文档旁生成试听。

本工作台针对第二条缺口：**不是再做一个「能读写文件的聊天框」，而是给设计师一套自己的工作环境。**

当前已落地的回应：

- **设计文档工作区**：真实 Markdown，中文路径（`愿景.md`、`系统/核心循环.md`），可直接进 Git
- **Ask / Plan / Agent**：只读查询、先出计划、再动手写，权限用工具列表隔离，不靠提示词口头约束
- **上下文压缩与 Rule**：长对话自动摘要；团队写作习惯可以固化进全局 / 项目规则

后续方向（尚未实现，架构按此预留）：按文档类型挂生成能力——例如在 `角色设计.md` 旁调用生图，在音效设计文档旁生成试听。

---

## 快速开始

### 环境要求


| 依赖                   | 版本             |
| -------------------- | -------------- |
| Python               | 3.11 或更高       |
| Node.js              | 18 或更高（自带 npm） |
| 一个 OpenAI 兼容 API Key | 必需             |




### 一键启动

Windows：

```powershell
.\start.bat
```

macOS / Linux：

```bash
./start.sh
```

脚本会自动创建 Python 虚拟环境、安装前后端依赖、拉起两个服务并打开浏览器。首次运行需要几分钟装依赖，之后启动只要几秒。

- 工作台：[http://127.0.0.1:5173](http://127.0.0.1:5173)
- API 文档（Swagger）：[http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)



### 配置模型

启动后打开工作台右上角 **设置 → 模型服务**，添加一个 Provider：


| 字段       | 填什么                              |
| -------- | -------------------------------- |
| 名称       | 随便起，例如 `DeepSeek`                |
| Base URL | 例如 `https://api.deepseek.com/v1` |
| API Key  | 你的密钥                             |
| 模型       | 例如 `deepseek-chat`               |


保存后在顶部模型选择器里选中它即可开始对话。密钥写入 `backend/data/config.json`（该目录已在 `.gitignore` 中，不会进版本库）。

也可以用环境变量作为首次启动的默认值：

```bash
OPENAI_API_KEY=sk-xxx
OPENAI_BASE_URL=https://api.deepseek.com/v1
OPENAI_MODEL=deepseek-chat
OPENAI_UTILITY_MODEL=deepseek-chat   # 可选，用于上下文压缩的小模型
```

---



## 三种模式


| 模式        | 能读文档 | 能写文档 | 典型用途                             |
| --------- | ---- | ---- | -------------------------------- |
| **Ask**   | ✅    | ❌    | 「战斗系统现在是怎么定的？」纯查询，绝不会动你的文件       |
| **Plan**  | ✅    | ❌    | 大改之前先出一份计划：目标、非目标、要动哪些文档、待敲定的设计点 |
| **Agent** | ✅    | ✅    | 实际动手写入和修改设计文档                    |


Plan 模式产出的计划显示在右侧面板，你逐条确认后点 **执行计划**，Agent 会带着这份计划一次性把文档写完。

---



## 手动启动

不想用脚本时：

```bash
# 后端
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS / Linux
pip install -e ".[dev]"
python -m app.main            # http://127.0.0.1:8000

# 前端（另开一个终端）
cd frontend
npm install
npm run dev                   # http://127.0.0.1:5173
```

Vite 开发服务器会把 `/api` 代理到后端 `8000` 端口。

---



## 测试

```bash
cd backend && pytest        # 34 个后端测试文件
cd frontend && npm run test # Vitest
```

---



## 目录结构

```
game-designer/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI 入口
│   │   ├── graph.py         # LangGraph 图组装
│   │   ├── state.py         # Agent 状态定义
│   │   ├── config.py        # 多 Provider 模型配置
│   │   ├── agent/           # Agent 核心：节点、工具、提示词、权限
│   │   ├── api/             # REST 路由与 SSE 流
│   │   ├── conversations/   # 对话服务与运行时
│   │   ├── docs/            # 文档工作区读写、OCC 版本控制
│   │   ├── memory/          # 上下文压缩与 token 预算
│   │   ├── rules/           # User Rule / Project Rule
│   │   ├── store/           # SQLite 注册表
│   │   └── usage/           # Token 用量追踪
│   ├── tests/
│   └── data/                # 运行时数据（不进版本库）
├── frontend/
│   └── src/
│       ├── studio/          # 工作台核心：聊天、Plan 面板、文档树
│       ├── views/           # 页面级视图
│       └── components/      # 通用组件
├── start.ps1 / start.sh / start.bat
└── README.md
```



## 数据存在哪

全部在 `backend/data/`，纯本地，不上传：


| 路径                    | 内容                                  |
| --------------------- | ----------------------------------- |
| `config.json`         | 模型 Provider 与 API Key               |
| `registry.sqlite`     | 项目、对话、文件夹、用量记录                      |
| `checkpoints.sqlite`  | LangGraph 对话状态快照                    |
| `projects/{id}/docs/` | **你的设计文档**（普通 Markdown，可直接用任何编辑器打开） |
| `user-rules.json`     | 全局工作习惯规则                            |


想备份或迁移，直接拷 `backend/data/` 整个目录即可。