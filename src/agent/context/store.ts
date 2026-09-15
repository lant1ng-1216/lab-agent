import type { CodingMirrorEvent, ChatMessage, LoopStatus } from '../../shared/protocol';

/**
 * Context isolation:
 * - Supervisor and Coding keep separate transcripts.
 * - Coding → Supervisor: unidirectional read-only mirror.
 * - Supervisor → Coding: NEVER inject discussion; only explicit commands.
 */
export class ContextStore {
  private supervisorChat: ChatMessage[] = [];
  private codingChat: ChatMessage[] = [];
  private mirror: CodingMirrorEvent[] = [];
  private supervisorStatus: LoopStatus = 'idle';
  private codingStatus: LoopStatus = 'idle';

  appendSupervisor(msg: ChatMessage) {
    this.supervisorChat.push(msg);
  }

  appendCoding(msg: ChatMessage) {
    this.codingChat.push(msg);
  }

  /** Coding emits; Supervisor may subscribe. Coding cannot read supervisor chat. */
  pushMirror(event: CodingMirrorEvent) {
    this.mirror.push(event);
    if (this.mirror.length > 500) this.mirror.shift();
  }

  getSupervisorChat() {
    return [...this.supervisorChat];
  }

  getCodingChat() {
    return [...this.codingChat];
  }

  /** Read-only snapshot for supervisor */
  getMirrorSnapshot() {
    return [...this.mirror];
  }

  setStatus(role: 'supervisor' | 'coding', status: LoopStatus) {
    if (role === 'supervisor') this.supervisorStatus = status;
    else this.codingStatus = status;
  }

  getStatus(role: 'supervisor' | 'coding') {
    return role === 'supervisor' ? this.supervisorStatus : this.codingStatus;
  }
}
