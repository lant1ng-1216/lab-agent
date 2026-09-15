import { useState } from "react";
import PromptBar from "../harness/beautiful-ui/PromptBar";

export default function PromptBarDemo() {
  const [sent, setSent] = useState<string[]>([]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] p-8">
      <div className="mb-8 text-center">
        <h1 className="mb-2 text-2xl font-bold text-white">Beautiful UI — PromptBar</h1>
        <p className="text-sm text-white/60">官网原样复用，未做任何修改</p>
      </div>

      <div className="w-full max-w-2xl">
        <PromptBar
          variant="Rounded"
          demo={true}
          onSend={(text) => setSent((s) => [...s, text])}
        />
      </div>

      {sent.length > 0 && (
        <div className="mt-8 w-full max-w-2xl rounded-lg bg-white/5 p-4">
          <div className="mb-2 text-xs font-medium text-white/40">已发送消息：</div>
          {sent.map((msg, i) => (
            <div key={i} className="py-1 text-sm text-white/80">
              {i + 1}. {msg}
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 text-xs text-white/30">
        输入 @ 或 / 查看菜单 · 点击模型名称切换 · 按 Enter 发送
      </div>
    </div>
  );
}
