import { useState } from "react";
import LoadingState from "../harness/beautiful-ui/LoadingState";
import PromptBar from "../harness/beautiful-ui/PromptBar";

export default function DemoPage() {
  const [sent, setSent] = useState<string[]>([]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-8">
      <div className="mx-auto max-w-4xl space-y-16">
        {/* 第一个 UI：Loading State */}
        <section>
          <div className="mb-6 text-center">
            <h1 className="mb-2 text-2xl font-bold text-white">1. Loading State</h1>
            <p className="text-sm text-white/60">官网第一个组件</p>
          </div>
          <div className="flex justify-center">
            <LoadingState />
          </div>
        </section>

        {/* 第八个 UI：Prompt Bar */}
        <section>
          <div className="mb-6 text-center">
            <h1 className="mb-2 text-2xl font-bold text-white">8. Prompt Bar</h1>
            <p className="text-sm text-white/60">输入框组件</p>
          </div>
          <div className="flex justify-center">
            <div className="w-full max-w-2xl">
              <PromptBar
                variant="Rounded"
                demo={true}
                onSend={(text) => setSent((s) => [...s, text])}
              />
            </div>
          </div>
          {sent.length > 0 && (
            <div className="mx-auto mt-4 w-full max-w-2xl rounded-lg bg-white/5 p-4">
              <div className="mb-2 text-xs font-medium text-white/40">已发送：</div>
              {sent.map((msg, i) => (
                <div key={i} className="py-1 text-sm text-white/80">
                  {i + 1}. {msg}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
