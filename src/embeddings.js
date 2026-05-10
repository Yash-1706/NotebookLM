import OpenAI from "openai";

const EMBEDDING_DIM = 384;
let strategy = "local";
let openaiClient = null;

export async function warmupEmbeddings() {
  const apiKey = process.env.EMBEDDING_API_KEY || process.env.OPENROUTER_API_KEY;
  if (apiKey) {
    try {
      openaiClient = new OpenAI({
        apiKey,
        baseURL: process.env.EMBEDDING_BASE_URL || "https://openrouter.ai/api/v1",
      });
      const test = await openaiClient.embeddings.create({
        model: process.env.EMBEDDING_MODEL || "openai/text-embedding-3-small",
        input: "test",
      });
      if (test.data?.[0]?.embedding?.length > 0) {
        strategy = "api";
        console.log(`Using API embeddings (${test.data[0].embedding.length}d)`);
        return;
      }
    } catch (err) {
      console.warn("API embeddings unavailable:", err.message);
    }
  }
  strategy = "local";
  console.log(`Using local hash embeddings (${EMBEDDING_DIM}d)`);
}

function localEmbedding(text) {
  const vec = new Float32Array(EMBEDDING_DIM);
  const normalized = text.toLowerCase().replace(/[^\w\s]/g, " ");
  const words = normalized.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return Array.from(vec);

  function hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    return h;
  }

  for (const word of words) {
    const h = hash(word);
    vec[Math.abs(h) % EMBEDDING_DIM] += (h > 0 ? 1 : -1) * 1.0;
  }

  for (let i = 0; i < words.length - 1; i++) {
    const h = hash(words[i] + " " + words[i + 1]);
    vec[Math.abs(h) % EMBEDDING_DIM] += (h > 0 ? 1 : -1) * 0.7;
  }

  for (const word of words) {
    if (word.length >= 3) {
      for (let i = 0; i <= word.length - 3; i++) {
        const h = hash(word.slice(i, i + 3));
        vec[Math.abs(h) % EMBEDDING_DIM] += (h > 0 ? 1 : -1) * 0.3;
      }
    }
  }

  let norm = 0;
  for (let i = 0; i < EMBEDDING_DIM; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < EMBEDDING_DIM; i++) vec[i] /= norm;

  return Array.from(vec);
}

async function apiEmbedding(text) {
  const response = await openaiClient.embeddings.create({
    model: process.env.EMBEDDING_MODEL || "openai/text-embedding-3-small",
    input: text.slice(0, 8000),
  });
  return response.data[0].embedding;
}

export async function getEmbedding(text) {
  if (strategy === "api") {
    try { return await apiEmbedding(text); }
    catch { strategy = "local"; }
  }
  return localEmbedding(text);
}

export async function getEmbeddings(texts) {
  if (strategy === "api") {
    try {
      const BATCH_SIZE = 100;
      const all = [];
      for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        const batch = texts.slice(i, i + BATCH_SIZE).map((t) => t.slice(0, 8000));
        const res = await openaiClient.embeddings.create({
          model: process.env.EMBEDDING_MODEL || "openai/text-embedding-3-small",
          input: batch,
        });
        all.push(...res.data.sort((a, b) => a.index - b.index).map((d) => d.embedding));
      }
      return all;
    } catch { strategy = "local"; }
  }
  return texts.map(localEmbedding);
}

export function isModelReady() { return true; }
