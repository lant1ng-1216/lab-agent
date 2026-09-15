# Lab Agent Coding（agents/lab-coding）

独立 Coding Agent（Lab Code）。

## 启动

```bash
cd agents/lab-coding
./start-lab-agent.command /path/to/your/project
```

配置：复制 `lab-agent.env.example` → `lab-agent.env`。  
若本地仍有旧版 `freecode.env`，启动器会兼容读取，但建议改名为 `lab-agent.env`。

## 本阶段范围

- 品牌：Lab Agent（欢迎页 / 标题 / 帮助等）
- 认知：Lab Code（系统提示身份）
- **不改**工具与编码能力
- 自定义终端 logo 设计中；当前为临时文字标记 `LabMark`

Security 文档链接：环境变量 `LAB_SECURITY_URL`（见 `lab-agent.env.example`）。

插件市场：默认**不**安装 Anthropic marketplace。Lab 自有市场接口见
`src/constants/labMarketplace.ts`；就绪后设置 `LAB_MARKETPLACE_ENABLED=1` +
`LAB_MARKETPLACE_REPO=...` 即可自动安装。

## 构建

改源码后需重建二进制：

```bash
cd agents/lab-coding
bun run build:dev
```
