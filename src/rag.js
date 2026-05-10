import OpenAI from "openai";
import { getEmbedding } from "./embeddings.js";

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

const SYSTEM_PROMPT = `You are NotebookLM — a document-grounded Q&A assistant. You answer questions using ONLY the provided document context. You never use your own training knowledge.

STRICT RULES:
1. Use ONLY the information from the "Document Context" section below. If the answer cannot be found there, respond exactly with: "I couldn't find information about that in the uploaded document. Try rephrasing your question or uploading a document that covers this topic."
2. NEVER fabricate, assume, or infer information beyond what is explicitly stated in the context.
3. Always cite your sources inline using the format [Page X].

RESPONSE FORMAT:
- Start with a **bold one-line summary** that directly answers the question.
- Follow with a detailed explanation using **bullet points** for clarity.
- Use **bold** for key terms and concepts.
- Use \`code formatting\` for any code, commands, file names, or technical identifiers.
- If the answer has multiple parts or topics, use **### subheadings** to organize them.
- End every factual statement with its page citation [Page X].
- Keep the response thorough but focused — no filler or repetition.

Document Context:
{CONTEXT}`;

const FREE_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "nousresearch/hermes-3-llama-3.1-405b:free",
  "meta-llama/llama-3.2-3b-instruct:free",
  "nvidia/nemotron-3-nano-30b-a3b:free",
  "qwen/qwen3-coder:free",
  "google/gemma-4-31b-it:free",
];

export async function ragQuery(query, vectorStore, collectionName, topK = 5) {
  const queryEmbedding = await getEmbedding(query);
  const results = vectorStore.search(collectionName, queryEmbedding, topK);

  if (results.length === 0) {
    return {
      answer: "No relevant information found in the document. Please try rephrasing your question.",
      sources: [],
    };
  }

  const contextStr = results
    .map((r, i) => `[Source ${i + 1}] (Page ${r.metadata?.page ?? "N/A"}, Relevance: ${(r.score * 100).toFixed(1)}%)\n${r.content}`)
    .join("\n\n---\n\n");

  const systemPrompt = SYSTEM_PROMPT.replace("{CONTEXT}", contextStr);
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: query },
  ];

  const tryModel = async (model) => {
    const res = await client.chat.completions.create({
      model,
      messages,
      temperature: 0.3,
      max_tokens: 2048,
    });
    if (!res?.choices?.[0]?.message?.content) throw new Error("Empty response");
    console.log(`  Response from ${model}`);
    return res;
  };

  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Request timed out. Free models may be busy, please try again.")), 30000)
  );

  let response;
  try {
    response = await Promise.race([
      Promise.any(FREE_MODELS.map(tryModel)),
      timeout,
    ]);
  } catch (err) {
    const msg = err instanceof AggregateError
      ? "All free models are currently unavailable. Please try again in a minute."
      : err.message;
    throw new Error(msg);
  }

  return {
    answer: response.choices[0].message.content,
    sources: results.map((r) => ({
      content: r.content.substring(0, 300) + (r.content.length > 300 ? "..." : ""),
      page: r.metadata?.page ?? "N/A",
      score: Math.round(r.score * 100),
    })),
  };
}
