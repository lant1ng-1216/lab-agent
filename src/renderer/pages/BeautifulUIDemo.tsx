import { useState } from "react";
import PromptBar from "../harness/beautiful-ui/PromptBar";
import LoadingState from "../harness/beautiful-ui/LoadingState";
import Thinking from "../harness/beautiful-ui/Thinking";
import StreamingText from "../harness/beautiful-ui/StreamingText";
import Chat from "../harness/beautiful-ui/Chat";
import TaskRows from "../harness/beautiful-ui/TaskRows";

export default function BeautifulUIDemo() {
  const [tab, setTab] = useState<string>("promptbar");

  const tabs = [
    { id: "promptbar", label: "PromptBar" },
    { id: "loading", label: "LoadingState" },
    { id: "thinking", label: "Thinking" },
    { id: "streaming", label: "StreamingText" },
    { id: "chat", label: "Chat" },
    { id: "tasks", label: "TaskRows" },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* header */}
      <div className="border-b border-white/10 p-4">
        <h1 className="text-xl font-bold">Beautiful UI — 组件验证</h1>
        <p className="text-sm text-white/50">21 个组件源码已提取，逐个验证渲染效果</p>
      </div>

      {/* tabs */}
      <div className="flex gap-1 border-b border-white/10 p-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              tab === t.id ? "bg-white/10 text-white" : "text-white/50 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* content */}
      <div className="p-8">
        {tab === "promptbar" && (
          <div className="mx-auto max-w-2xl">
            <h2 className="mb-4 text-lg font-semibold">PromptBar — 底部输入框</h2>
            <PromptBar variant="Rounded" demo={true} />
            <div className="mt-4 text-xs text-white/40">
              输入 @ 或 / 查看菜单 · 点击模型名称切换 · 按 Enter 发送
            </div>
          </div>
        )}

        {tab === "loading" && (
          <div className="mx-auto max-w-2xl space-y-8">
            <h2 className="text-lg font-semibold">LoadingState — 加载状态</h2>
            <div className="space-y-4">
              <div>
                <div className="mb-2 text-sm text-white/60">Drive 变体（默认）</div>
                <LoadingState variant="Drive" label="处理中" />
              </div>
              <div>
                <div className="mb-2 text-sm text-white/60">Dots 变体</div>
                <LoadingState variant="Dots" label="加载中" />
              </div>
              <div>
                <div className="mb-2 text-sm text-white/60">Orbit 变体</div>
                <LoadingState variant="Orbit" label="运行中" />
              </div>
            </div>
          </div>
        )}

        {tab === "thinking" && (
          <div className="mx-auto max-w-2xl space-y-8">
            <h2 className="text-lg font-semibold">Thinking — 思考状态</h2>
            <div className="space-y-6">
              <div>
                <div className="mb-2 text-sm text-white/60">Coding 变体（工具调用 trace）</div>
                <Thinking variant="Coding" />
              </div>
              <div>
                <div className="mb-2 text-sm text-white/60">Steps 变体</div>
                <Thinking variant="Steps" />
              </div>
            </div>
          </div>
        )}

        {tab === "streaming" && (
          <div className="mx-auto max-w-2xl">
            <h2 className="mb-4 text-lg font-semibold">StreamingText — 流式文本</h2>
            <StreamingText />
          </div>
        )}

        {tab === "chat" && (
          <div className="mx-auto max-w-2xl">
            <h2 className="mb-4 text-lg font-semibold">Chat — 对话面板</h2>
            <Chat />
          </div>
        )}

        {tab === "tasks" && (
          <div className="mx-auto max-w-2xl">
            <h2 className="mb-4 text-lg font-semibold">TaskRows — 任务行</h2>
            <TaskRows />
          </div>
        )}
      </div>
    </div>
  );
}
