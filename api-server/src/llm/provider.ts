// Swappable LLM/embedding abstraction (D2: OpenAI today, but the rest of the code
// only depends on these interfaces so the provider can be changed in one place).

export type JsonSchema = Record<string, unknown>;

export interface LLMProvider {
  // Structured extraction: returns an object validated against `schema`.
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

// Tool-calling chat for the agentic /ask loop. Kept provider-agnostic (the
// OpenAI request/response shapes live in the OpenAI implementation) so the loop
// itself never imports the OpenAI SDK.
export interface ToolSpec {
  name: string;
  description: string;
  parameters: JsonSchema;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string; // raw JSON string the model produced
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
