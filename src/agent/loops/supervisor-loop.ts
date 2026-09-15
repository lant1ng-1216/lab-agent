import type { LLMProvider } from '../providers/deepseek';
import type { ContextStore } from '../context/store';
import type { ChatMessage, SupervisorCommand } from '../../shared/protocol';

const SUPERVISOR_SYSTEM = `你是 Lab Agent 的「监工」角色。
你不写代码。你负责：澄清意图、整理 PRD、对照验收、发现偏离、下达显式指令。
你可以看到 Coding Agent 的只读镜像（汇报 / diff 摘要），但你的讨论上下文绝不能写回 Coding。
对用户：对齐感受、敢指出跑偏，不要无脑附和。`;

function id() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export class SupervisorLoop {
  constructor(
    private llm: LLMProvider,
    private store: ContextStore,
    private emitCommand: (cmd: SupervisorCommand) => void,
    private onMessage: (msg: ChatMessage) => void,
  ) {}

  async handleUser(text: string) {
    const userMsg: ChatMessage = {
      id: id(),
      role: 'user',
      content: text,
      ts: Date.now(),
    };
    this.store.appendSupervisor(userMsg);
    this.onMessage(userMsg);
    this.store.setStatus('supervisor', 'thinking');

    const mirror = this.store.getMirrorSnapshot().slice(-12);
    const mirrorBlock =
      mirror.length === 0
        ? '（尚无 Coding 镜像）'
        : mirror.map((m) => `- [${m.kind}] ${m.summary}`).join('\n');

    const history = this.store.getSupervisorChat().slice(-20).map((m) => ({
      role: m.role === 'system' ? ('system' as const) : m.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: m.content,
    }));

    const reply = await this.llm.complete([
      { role: 'system', content: SUPERVISOR_SYSTEM },
      {
        role: 'system',
        content: `Coding 只读镜像（不可写回）：\n${mirrorBlock}`,
      },
      ...history,
    ]);

    const assistantMsg: ChatMessage = {
      id: id(),
      role: 'assistant',
      content: reply,
      ts: Date.now(),
    };
    this.store.appendSupervisor(assistantMsg);
    this.onMessage(assistantMsg);
    this.store.setStatus('supervisor', 'idle');

    // Heuristic: if user confirms sending PRD / instruction, emit explicit command
    if (/确认|发给|派活|按 PRD|下达/.test(text) || /发送指令|DISPATCH:/.test(reply)) {
      const cmd: SupervisorCommand = {
        id: id(),
        type: 'instruction',
        payload: reply,
        ts: Date.now(),
      };
      this.emitCommand(cmd);
    }
  }
}
