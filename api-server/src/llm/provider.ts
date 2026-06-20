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
