import OpenAI from "openai";
import systemConfig from "../platform/config/index";

const client = new OpenAI({ apiKey: systemConfig.OPENAI_API_KEY });

const FAITHFULNESS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["claims"],
  properties: {
    claims: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["claim", "supported"],
        properties: {
          claim: { type: "string" },
          supported: { type: "boolean" },
        },
      },
    },
  },
};

const RELEVANCY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["addresses", "reason"],
  properties: {
    addresses: { type: "string", enum: ["full", "partial", "none"] },
    reason: { type: "string" },
  },
};

async function judgeJson<T>(
  system: string,
  user: string,
  schema: Record<string, unknown>,
  name: string
): Promise<T> {
  const resp = await client.chat.completions.create({
    model: systemConfig.OPENAI_JUDGE_MODEL,
    temperature: 0,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: { type: "json_schema", json_schema: { name, strict: true, schema } },
  });
  return JSON.parse(resp.choices[0]?.message?.content ?? "{}") as T;
}

export interface FaithfulnessResult {
  score: number;
  supported: number;
  total: number;
  unsupported: string[];
}

export async function judgeFaithfulness(
  answer: string,
  contexts: string[]
): Promise<FaithfulnessResult> {
  const system = `You are a strict faithfulness judge. Given an ANSWER and the CONTEXTS it was supposed to be based on, break the answer into atomic factual claims. For each claim set supported=true ONLY if it is directly supported by the contexts; set supported=false if it states a fact not present in the contexts (a hallucination) or contradicts them. Ignore pure framing/transition sentences that assert no fact.`;
  const user = `CONTEXTS:\n${contexts.map((c, i) => `[${i + 1}] ${c}`).join("\n") || "(none)"}\n\nANSWER:\n${answer}`;
  const out = await judgeJson<{ claims: { claim: string; supported: boolean }[] }>(
    system,
    user,
    FAITHFULNESS_SCHEMA,
    "faithfulness"
  );
  const total = out.claims.length;
  const supported = out.claims.filter((c) => c.supported).length;
  return {
    score: total === 0 ? 1 : supported / total,
    supported,
    total,
    unsupported: out.claims.filter((c) => !c.supported).map((c) => c.claim),
  };
}

export async function judgeRelevancy(question: string, answer: string): Promise<number> {
  const system = `You judge ANSWER RELEVANCY: does the answer directly address the question that was asked? "full" = directly and completely addresses it; "partial" = addresses it but is incomplete, hedged, or padded with irrelevant material; "none" = evades, is off-topic, or is a refusal. Judge relevance to the QUESTION only, not factual correctness.`;
  const user = `QUESTION:\n${question}\n\nANSWER:\n${answer}`;
  const out = await judgeJson<{ addresses: "full" | "partial" | "none" }>(
    system,
    user,
    RELEVANCY_SCHEMA,
    "relevancy"
  );
  return out.addresses === "full" ? 1 : out.addresses === "partial" ? 0.5 : 0;
}
