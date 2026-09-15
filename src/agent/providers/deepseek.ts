export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMProvider {
  id: string;
  complete(messages: LLMMessage[], opts?: { temperature?: number }): Promise<string>;
}

export class DeepSeekProvider implements LLMProvider {
  id = 'deepseek';

  constructor(
    private apiKey: string,
    private model = 'deepseek-chat',
    private baseUrl = 'https://api.deepseek.com',
  ) {}

  async complete(messages: LLMMessage[], opts?: { temperature?: number }): Promise<string> {
    if (!this.apiKey) {
      return '[DeepSeek] 未配置 API Key。请在设置中填入 DEEPSEEK_API_KEY，当前为离线占位回复。';
    }

    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: opts?.temperature ?? 0.3,
        stream: false,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`DeepSeek error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content?.trim() || '';
  }
}
