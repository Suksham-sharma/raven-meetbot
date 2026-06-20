import OpenAI from "openai";
import systemConfig from "../config";
import type { EmbeddingProvider, JsonSchema, LLMProvider } from "./provider";

// OpenAI implementation of the LLM + embedding interfaces.
// Extraction uses Structured Outputs (strict JSON schema) for guaranteed-shape output.
class OpenAIProvider implements LLMProvider, EmbeddingProvider {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({ apiKey: systemConfig.OPENAI_API_KEY });
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
}

export const openaiProvider = new OpenAIProvider();
