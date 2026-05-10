import OpenAI from "openai";
import { getEmbedding } from "./embeddings.js";

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

const groqClient = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
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
  "openrouter/free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "nousresearch/hermes-3-llama-3.1-405b:free",
  "meta-llama/llama-3.1-8b-instruct:free",
  "meta-llama/llama-3.2-3b-instruct:free",
  "nvidia/llama-3.1-nemotron-70b-instruct:free",
  "qwen/qwen-2.5-72b-instruct:free",
  "qwen/qwen-2.5-coder-32b-instruct:free",
  "google/gemini-2.0-flash-lite-preview-02-05:free",
  "google/gemini-2.0-pro-exp:free",
  "mistralai/mistral-nemo:free",
  "deepseek/deepseek-r1-distill-llama-70b:free",
  "deepseek/deepseek-chat:free",
];

const GROQ_MODELS = [
  "llama-3.3-70b-versatile",
  "llama3-70b-8192",
  "llama3-8b-8192",
  "mixtral-8x7b-32768",
  "gemma2-9b-it"
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
    console.log(`  Response from OpenRouter ${model}`);
    return res;
  };

  const tryGroqModel = async (model) => {
    const res = await groqClient.chat.completions.create({
      model,
      messages,
      temperature: 0.3,
      max_tokens: 2048,
    });
    if (!res?.choices?.[0]?.message?.content) throw new Error("Empty response");
    console.log(`  Response from Groq ${model}`);
    return res;
  };

  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Request timed out.")), 30000)
  );

  let response;
  try {
    console.log("Trying OpenRouter models...");
    response = await Promise.race([
      Promise.any(FREE_MODELS.map(tryModel)),
      timeout,
    ]);
  } catch (err) {
    console.log("OpenRouter models failed. Falling back to Groq models...");
    try {
      response = await Promise.race([
        Promise.any(GROQ_MODELS.map(tryGroqModel)),
        timeout,
      ]);
    } catch (groqErr) {
      const msg = groqErr instanceof AggregateError
        ? "All AI models (OpenRouter and Groq) are currently unavailable. Please try again in a minute."
        : groqErr.message;
      throw new Error(msg);
    }
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
