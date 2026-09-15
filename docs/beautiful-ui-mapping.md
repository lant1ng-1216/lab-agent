# Lab Agent · Beautiful UI 模块映射方案

> 原则：每个组件只在**该出现的场景**出现，不堆叠、不默认展示、不干扰主流程。

---

## 一、组件总览与适用场景

| Beautiful UI 组件 | 适用模块 | 触发时机 | 展示位置 |
|-------------------|---------|---------|---------|
| **Loading State** | Lab Coding 启动 / 任务执行中 | 节点 spawn 后、任务 running 时 | 节点状态灯旁小字 / Inspector 头部 |
| **Thinking** | Lab 监工梳理意图 / Coding 推理中 | status === "thinking" | Inspector 对话流顶部（可展开） |
| **Streaming Text** | Agent 流式输出 | streaming 非 null | Inspector 对话流 / 节点预览区（最后 2 行） |
| **Approval Card** | Lab 监工确认派发 / Coding 请求权限 | approval 非 null / PTY 检测到 permission | 画布中央模态层（优先）/ Inspector 内嵌 |
| **Tool Chips** | 文件编辑、命令执行、搜索等工具调用 | 工具调用完成 | Inspector 对话流内（紧凑横排） |
| **Task Rows** | Lab Coding 任务列表 | 有 active task | Inspector「产出」tab / 节点底部摘要 |
| **Chat** | 完整对话面板 | 双击节点打开 Inspector | Inspector「对话」tab 主体 |
| **Prompt Bar** | 底部 composer | 始终显示 | 画布底部居中 |
| **Recommendation Card** | Lab 监工建议下一步 | 监工产出建议时 | Inspector 内嵌 / 画布通知 |
| **Context Cards** | 引用文件/文档/知识 | 对话中 @ 引用或检索到上下文 | Inspector 对话流内（消息下方） |
| **Diff Table** | 代码改动对比 | Coding 产出 diff | Inspector「产出」tab / 模态层 |
| **Records Table** | 实验列表 / 任务历史 | 查看历史记录 | 左栏「实验」区（可切换表格视图） |
| **Filter Table** | 任务筛选 | 有多个任务时 | Inspector「产出」tab 顶部 |
| **Sidebar Nav** | 左栏导航 | 始终显示 | 左栏 |
| **Search** | 命令搜索 / 文件搜索 | 按 ⌘K 或点击搜索 | 顶部中央弹层 |
| **Flowchart** | Lab 监工任务拆解可视化 | 监工产出 Plan 时 | Inspector「产出」tab / 画布只读模式 |
| **Insight Cards** | 实验数据分析 | 实验完成后统计 | Inspector「产出」tab 底部 |
| **Code Block** | 代码片段展示 | 对话中包含代码 | Inspector 对话流内 |
| **Fine-tune Card** | 调整 Agent 参数 | 设置面板内 | 设置面板「Agent 参数」区 |
| **Selection Actions** | 选中文字后操作 | 对话流中选中文字 | 文字上方浮动工具条 |
| **Agent Screen** | 远程桌面/浏览器嵌套 | 未来接入浏览器 Agent | 节点类型扩展 |

---

## 二、分模块详细设计

### 模块 1：左栏 Sidebar

**使用组件**：Sidebar Nav + Records Table（可选）

**布局**：
```
┌─────────────────┐
│  [Logo] Lab Agent│  ← 固定头部，红绿灯安全区
│  ─────────────  │
│  ＋ 新实验       │  ← 主按钮
│  ─────────────  │
│  实验            │  ← 分区标题
│  ● 实验 1   [×] │  ← Records Table 紧凑模式：名称+状态+删除
│  ○ 实验 2       │
│  ─────────────  │
│  当前实验        │  ← 分区标题
│  ● Lab · idle   │  ← 点击定位到节点
│  ● Coding · run │
│  ─────────────  │
│  [设置]  [主题]  │  ← 底部固定
└─────────────────┘
```

**交互**：
- 实验行 hover 出 ×，双击重命名
- 当前实验区点击 → 画布聚焦到该节点（pan to node）
- 设置/主题切换保持不变

---

### 模块 2：画布 Canvas

**使用组件**：（无 Beautiful UI 直接组件，自定义节点）

**节点状态**：

| 状态 | 视觉 | 交互 |
|------|------|------|
| 展示态（默认）| 整卡可拖，终端区不可点，显示最后 3 行输出 | 单击选中，双击进交互态 |
| 交互态 | 边框高亮 + EDIT 标，终端可打字 | Esc / 单击空白退出 |
| 思考中 | 状态灯黄闪 + Loading State 小字 | 不可交互 |
| 错误 | 状态灯红 + 错误摘要 | 点击展开详情 |

**连线**：
- 贝塞尔曲线，非直线
- 选中时加粗变色
-  hover 显示「删除连线」×

**添加菜单**：
- 双击空白 / 中央按钮触发
- 点击选项后关闭
- 点遮罩关闭

---

### 模块 3：节点 TermNode

**使用组件**：Loading State + Task Rows（摘要）

**结构**：
```
┌─────────────────────────┐
│ ●●●  Lab Coding — 终端  │  ← macOS chrome
│─────────────────────────│
│                         │
│  [终端输出区]            │  ← xterm.js，展示态只读
│  lab> _                 │
│                         │
│─────────────────────────│
│  ▶ task-001  running    │  ← Task Rows 紧凑摘要（可选）
└─────────────────────────┘
```

**交互态切换**：
- 展示态：`pointer-events: none` on terminal，整卡 drag
- 交互态：`pointer-events: auto`，边框高亮，终端 focus

---

### 模块 4：Composer（底部输入）

**使用组件**：Prompt Bar

**结构**：
```
┌─────────────────────────────────────────┐
│ [L] Lab Coding ▼ │ 💬 对话 │ Lab 监工 │  ← 引擎+模式+目标
│─────────────────────────────────────────│
│  输入指令...                    [发送]  │  ← textarea 自适应
└─────────────────────────────────────────┘
```

**功能**：
- `@` 触发文件/上下文引用（Context Cards 数据源）
- `/` 触发命令（Lab Coding 的 /help /clear 等）
- `↑` 历史召回
- 对话模式 → `sendChat`；终端模式 → `ptyWrite`

---

### 模块 5：Inspector（右栏）

**使用组件**：Chat + Thinking + Streaming Text + Tool Chips + Diff Table + Context Cards + Code Block

**Tab 结构**：

| Tab | 内容 | 组件 |
|-----|------|------|
| 对话 | 完整对话流 | Chat + Thinking + Streaming Text + Tool Chips + Context Cards + Code Block + Selection Actions |
| 产出 | PRD / Plan / Diff / 任务列表 | Diff Table + Task Rows + Filter Table + Insight Cards |
| 文件 | 工作目录文件树 | 自定义文件树（无 Beautiful UI 对应） |

**对话 tab 消息类型**：

| 消息类型 | 组件 | 说明 |
|---------|------|------|
| user | UserBubble | 用户输入 |
| assistant | AssistantBlock + Streaming Text | AI 流式回复 |
| thinking | Thinking | 推理过程（可展开） |
| tool | Tool Chips | 工具调用记录 |
| context | Context Cards | 引用的文件/知识 |
| code | Code Block | 代码片段 |
| approval | Approval Card | 待确认操作 |

---

### 模块 6：介入模态层

**使用组件**：Approval Card + Recommendation Card

**触发场景**：

| PTY 输出模式 | 模态类型 | 组件 |
|-----------|---------|------|
| `[Y/n]` / `Allow?` / `Proceed?` | 确认 | Approval Card（允许/拒绝/总是） |
| `1. xxx 2. yyy` 多行 | 选项 | Recommendation Card（列表选择） |
| `:` 结尾等待输入 | 输入 | 自定义输入卡片 |
| `Error` / `Failed` | 错误 | 错误卡片（重试/忽略/详情） |

**位置**：画布中央偏上，毛玻璃遮罩，可拖。

---

### 模块 7：设置面板

**使用组件**：Fine-tune Card

**分区**：
- 主题（纯黑/纯白）
- Coding 引擎（列表选择，显示状态：可用/开发中/需安装）
- Lab Coding 参数（模型选择、温度、最大 token）→ Fine-tune Card 样式
- DeepSeek API Key
- 快捷键说明

---

### 模块 8：搜索（⌘K）

**使用组件**：Search

**功能**：
- 搜索实验
- 搜索命令（/help /clear 等）
- 搜索文件（工作目录内）
- 空状态提示

---

## 三、Lab Coding PRD

### 产品定位

**Lab Coding** 是 Lab Agent 产品自建的 AI Coding Agent，与 Lab 监工深度绑定，在画布上以终端节点形式存在。

### 核心价值

- 不离开画布，有一个真正懂代码的 AI 同事
- 与 Lab 监工无缝协作：接收派发、上报进度、响应打回
- 品牌化的终端体验：不是通用 CLI，是 Lab 产品的一部分

### 目标用户

- 使用 Lab Agent 做实验的工程师
- 需要快速验证想法、不想切窗口的开发者

### 功能需求

#### P0 核心

| 功能 | 描述 | 验收标准 |
|------|------|---------|
| REPL 环境 | 启动后显示 logo、提示符，等待输入 | 终端显示 `lab>` 提示符 |
| 自然语言对话 | 输入自然语言，流式输出回复 | 回复流畅，支持 markdown |
| `/help` | 显示可用命令 | 列出所有命令 |
| `/clear` | 清屏 | 终端清空，提示符回到顶部 |
| `/model` | 切换模型 | 显示当前模型，可切换 |
| `/task` | 新建任务 | 生成 task-id，进入任务模式 |
| `/status` | 显示当前状态 | 显示任务进度、token 用量 |
| `/exit` | 退出 | 终端关闭，节点显示「已退出」 |

#### P1 协作

| 功能 | 描述 | 验收标准 |
|------|------|---------|
| 接收派发 | Lab 监工发送 `[TASK]` 协议 | 终端显示任务卡片，确认后开始 |
| 上报进度 | 定时/关键节点发送 `[PROGRESS]` | Inspector 任务列表实时更新 |
| 代码 diff | 任务完成后发送 `[DIFF]` | Inspector 产出 tab 显示 diff |
| 请求权限 | 执行危险操作前发送 `[QUESTION]` | 画布弹模态层，用户确认后继续 |

#### P2 增强

| 功能 | 描述 |
|------|------|
| 文件操作 | 读/写/列目录，通过 `@` 引用 |
| 命令执行 | `!command` 直接执行 shell |
| 会话历史 | 保存对话，支持导出 |
| 多轮任务 | 任务内多轮对话，上下文保持 |

### 技术架构

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Renderer  │────→│    Main     │────→│  DeepSeek   │
│  (React)    │←────│  (Node)     │←────│    API      │
└─────────────┘     └─────────────┘     └─────────────┘
       ↑                   ↑
       │              ┌─────────────┐
       └──────────────│  lab-coding │
         IPC/PTY      │   (REPL)    │
                      └─────────────┘
```

**数据流**：
1. 用户在 composer 或终端输入
2. 走 IPC 到 main 进程
3. main 调 DeepSeek API（流式）
4. 流式数据写回 PTY → xterm.js 渲染
5. 协议消息（`[TASK]` 等）同时走 IPC 到 renderer 更新 UI

### 终端 UI 规范

```
┌────────────────────────────────────────┐
│                                        │
│   ██╗      █████╗ ██████╗              │
│   ██║     ██╔══██╗██╔══██╗             │
│   ██║     ███████║██████╔╝             │
│   ██║     ██╔══██║██╔══██╗             │
│   ███████╗██║  ██║██████╔╝             │
│   ╚══════╝╚═╝  ╚═╝╚═════╝              │
│                                        │
│   Lab Coding v0.1.0                    │
│   Type /help for commands              │
│                                        │
│   lab> _                               │
│                                        │
└────────────────────────────────────────┘
```

**颜色规范**：
- 提示符：`lab>` 用品牌蓝 `#3b82f6`
- 用户输入：默认前景色
- AI 回复：默认前景色
- 系统消息：灰色 `#6e6e73`
- 错误：红色 `#ff5f57`
- 成功：绿色 `#28c840`
- 警告：黄色 `#febc2e`

### 非功能需求

| 项 | 要求 |
|---|------|
| 启动速度 | < 500ms |
| 响应延迟 | 首 token < 2s（网络正常） |
| 内存占用 | < 100MB |
| 离线提示 | 无网络时显示友好错误，不崩溃 |
| 快捷键 | Esc 退出交互态，⌘K 搜索，⌘N 新实验 |

---

## 四、自查审核

### 方案合格点

- 每个 Beautiful UI 组件都有明确的使用场景和触发时机
- 没有默认堆叠，都是按需展示
- 覆盖了用户主流程（创建实验 → 添加节点 → 对话 → 产出）
- Lab Coding PRD 完整，有架构、有协议、有 UI 规范

### 风险与待确认

| 风险 | 缓解 |
|------|------|
| Beautiful UI 是 copy-paste 模式，需要手动集成 | 我按设计稿手写组件，参考其视觉规范 |
| Lab Coding REPL 开发量大 | 先实现 P0 核心，P1/P2 迭代 |
| 协议消息与终端输出混在一起 | 用特殊 escape sequence 区分，renderer 解析 |
| 文件树没有 Beautiful UI 对应组件 | 自定义轻量文件树 |

---

## 五、确认点

1. **Beautiful UI 集成方式**：我按官网视觉规范手写组件，还是你有办法拿到源码直接复制？

2. **Lab Coding P0 范围**：这轮只做 REPL + 自然语言对话 + /help + /clear，P1 协作协议下轮？

3. **文件树**：简单列表（名称+类型+大小），还是要有预览？

确认后我按以下顺序开工：
1. 修 Handle 外移 + 双击冒泡
2. 写 Lab Coding REPL（P0）
3. 对话持久化
4. 文件树
5. 实验切换隔离 + PTY 清理
6. 连线贝塞尔曲线