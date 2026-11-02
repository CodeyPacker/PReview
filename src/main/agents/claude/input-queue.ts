import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';

// Streaming input for query(). canUseTool needs it, and it lets answers be sent in later.
export class InputQueue implements AsyncIterable<SDKUserMessage> {
  private items: SDKUserMessage[] = [];
  private waiting?: (result: IteratorResult<SDKUserMessage>) => void;
  private done = false;

  push(text: string): void {
    const message: SDKUserMessage = {
      type: 'user',
      message: { role: 'user', content: text },
      parent_tool_use_id: null,
    };
    if (this.waiting) {
      const resolve = this.waiting;
      this.waiting = undefined;
      resolve({ value: message, done: false });
    } else {
      this.items.push(message);
    }
  }

  end(): void {
    this.done = true;
    this.waiting?.({ value: undefined, done: true });
    this.waiting = undefined;
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: () => {
        const item = this.items.shift();
        if (item) return Promise.resolve({ value: item, done: false });
        if (this.done) return Promise.resolve({ value: undefined, done: true });
        return new Promise((resolve) => (this.waiting = resolve));
      },
    };
  }
}
