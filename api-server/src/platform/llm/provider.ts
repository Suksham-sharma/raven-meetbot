
export type JsonSchema = Record<string, unknown>;

export interface LLMProvider {
  extract<T>(args: {
    system: string;
    user: string;
    schema: JsonSchema;
    schemaName: string;
  }): Promise<T>;
}

export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
}

// Provider-agnostic so the /ask loop never imports the OpenAI SDK directly.
export interface ToolSpec {
  name: string;
  description: string;
  parameters: JsonSchema;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; content: string };

export interface ChatTurn {
  content: string | null;
  toolCalls: ToolCall[];
}

export interface ChatProvider {
  chat(args: {
    messages: ChatMessage[];
    tools?: ToolSpec[];
    temperature?: number;
  }): Promise<ChatTurn>;
}
