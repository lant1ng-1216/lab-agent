import type { LLMProvider } from '../providers/deepseek';
import type { ContextStore } from '../context/store';
import type { ChatMessage, CodingMirrorEvent, SupervisorCommand } from '../../shared/protocol';

const CODING_SYSTEM = `你是 Lab Agent（Lab Code）——产品自建的 coding agent。
你负责在给定工作区完成软件工程任务：阅读、修改、解释、汇报。
在「常规态」你就是用户面对的唯一 Agent；简洁、直接、可执行。
若消息带有监工指令前缀（如 [instruction]），按指令执行，不要擅自扩大范围。`;

function id() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export class CodingLoop {
  constructor(
    private llm: LLMProvider,
    private store: ContextStore,
    private emitMirror: (ev: CodingMirrorEvent) => void,
    private onMessage: (msg: ChatMessage) => void,
  ) {}

  async handleCommand(cmd: SupervisorCommand) {
    const userMsg: ChatMessage = {
      id: id(),
      role: 'user',
      content: `[${cmd.type}] ${cmd.payload}`,
      ts: Date.now(),
    };
    this.store.appendCoding(userMsg);
    this.onMessage(userMsg);

    this.emitMirror({
      id: id(),
      kind: 'status',
      summary: `收到监工指令：${cmd.type}`,
      detail: cmd.payload.slice(0, 500),
      ts: Date.now(),
    });

    this.store.setStatus('coding', 'thinking');

    const history = this.store.getCodingChat().slice(-16).map((m) => ({
      role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: m.content,
    }));

    const reply = await this.llm.complete([
      { role: 'system', content: CODING_SYSTEM },
      ...history,
    ]);

    const assistantMsg: ChatMessage = {
      id: id(),
      role: 'assistant',
      content: reply,
      ts: Date.now(),
    };
    this.store.appendCoding(assistantMsg);
    this.onMessage(assistantMsg);

    this.emitMirror({
      id: id(),
      kind: 'report',
      summary: 'Coding 完成一轮汇报',
      detail: reply.slice(0, 800),
      ts: Date.now(),
    });

    this.store.setStatus('coding', 'idle');
  }

  async handleUser(text: string) {
    // Direct user chat inside coding window (still isolated from supervisor discussion)
    const userMsg: ChatMessage = {
      id: id(),
      role: 'user',
      content: text,
      ts: Date.now(),
    };
    this.store.appendCoding(userMsg);
    this.onMessage(userMsg);
    this.store.setStatus('coding', 'thinking');

    const history = this.store.getCodingChat().slice(-16).map((m) => ({
      role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: m.content,
    }));

    const reply = await this.llm.complete([
      { role: 'system', content: CODING_SYSTEM },
      ...history,
    ]);

    const assistantMsg: ChatMessage = {
      id: id(),
      role: 'assistant',
      content: reply,
      ts: Date.now(),
    };
    this.store.appendCoding(assistantMsg);
    this.onMessage(assistantMsg);

    this.emitMirror({
      id: id(),
      kind: 'message',
      summary: `Coding 会话：${text.slice(0, 60)}`,
      detail: reply.slice(0, 400),
      ts: Date.now(),
    });

    this.store.setStatus('coding', 'idle');
  }
}
