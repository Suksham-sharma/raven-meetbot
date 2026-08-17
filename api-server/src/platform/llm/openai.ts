import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import systemConfig from "../config/index";
import type {
  ChatMessage,
  ChatProvider,
  ChatTurn,
  EmbeddingProvider,
  JsonSchema,
  LLMProvider,
  ToolSpec,
} from "./provider";

class OpenAIProvider implements LLMProvider, EmbeddingProvider, ChatProvider {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: systemConfig.OPENAI_API_KEY,
      maxRetries: 5,
      timeout: 60_000,
    });
  }

  async extract<T>(args: {
    system: string;
    user: string;
    schema: JsonSchema;
    schemaName: string;
  }): Promise<T> {
    const resp = await this.client.chat.completions.create({
      model: systemConfig.OPENAI_EXTRACT_MODEL,
      temperature: 0,
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: args.schemaName, strict: true, schema: args.schema },
      },
    });

    const content = resp.choices[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI returned empty extraction content");
    }
    return JSON.parse(content) as T;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const resp = await this.client.embeddings.create({
      model: systemConfig.OPENAI_EMBED_MODEL,
      input: texts,
    });
    return resp.data.map((d) => d.embedding);
  }

  async chat(args: {
    messages: ChatMessage[];
    tools?: ToolSpec[];
    temperature?: number;
  }): Promise<ChatTurn> {
    const tools: ChatCompletionTool[] | undefined = args.tools?.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));

    const resp = await this.client.chat.completions.create({
      model: systemConfig.OPENAI_ASK_MODEL,
      temperature: args.temperature ?? 0,
      messages: args.messages.map(toOpenAIMessage),
      tools,
      tool_choice: tools ? "auto" : undefined,
    });

    const msg = resp.choices[0]?.message;
    return {
      content: msg?.content ?? null,
      toolCalls: (msg?.tool_calls ?? []).flatMap((tc) =>
        tc.type === "function"
          ? [{ id: tc.id, name: tc.function.name, arguments: tc.function.arguments }]
          : []
      ),
    };
  }
}

function toOpenAIMessage(m: ChatMessage): ChatCompletionMessageParam {
  switch (m.role) {
    case "system":
      return { role: "system", content: m.content };
    case "user":
      return { role: "user", content: m.content };
    case "tool":
      return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
    case "assistant":
      return {
        role: "assistant",
        content: m.content,
        tool_calls: m.toolCalls?.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: tc.arguments },
        })),
      };
  }
}

export const openaiProvider = new OpenAIProvider();
