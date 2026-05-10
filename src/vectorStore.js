import { randomUUID } from "crypto";
import { QdrantClient } from "@qdrant/js-client-rest";

export class VectorStore {
  constructor() {
    this.collections = new Map();
    this.qdrantCollections = new Set();
    this.qdrant = null;

    const qdrantUrl = process.env.QDRANT_URL;
    const qdrantApiKey = process.env.QDRANT_API_KEY;
    if (qdrantUrl) {
      this.qdrant = new QdrantClient({
        url: qdrantUrl,
        ...(qdrantApiKey ? { apiKey: qdrantApiKey } : {}),
      });
    }
  }

  async addDocuments(collectionName, documents) {
    if (!documents || documents.length === 0) return;

    if (!this.qdrant) {
      if (!this.collections.has(collectionName)) {
        this.collections.set(collectionName, []);
      }
      this.collections.get(collectionName).push(...documents);
      return;
    }

    const vectorSize = documents[0]?.embedding?.length;
    if (!vectorSize) throw new Error("Missing embeddings for Qdrant upsert.");
    await this.ensureCollection(collectionName, vectorSize);

    const points = documents.map((doc) => ({
      id: this.getPointId(doc.id),
      vector: doc.embedding,
      payload: {
        content: doc.content,
        metadata: doc.metadata ?? {},
        chunkId: doc.id,
      },
    }));

    await this.qdrant.upsert(collectionName, { wait: true, points });
  }

  async search(collectionName, queryEmbedding, k = 5) {
    if (!queryEmbedding || queryEmbedding.length === 0) return [];

    if (!this.qdrant) {
      const collection = this.collections.get(collectionName);
      if (!collection || collection.length === 0) return [];

      const scored = collection.map((doc) => ({
        content: doc.content,
        metadata: doc.metadata,
        score: cosineSimilarity(queryEmbedding, doc.embedding),
      }));

      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, k);
    }

    try {
      const response = await this.qdrant.search(collectionName, {
        vector: queryEmbedding,
        limit: k,
        with_payload: true,
        with_vector: false,
      });
      const hits = Array.isArray(response) ? response : response?.result ?? [];
      return hits.map((hit) => ({
        content: hit.payload?.content ?? "",
        metadata: hit.payload?.metadata ?? {},
        score: hit.score ?? 0,
      }));
    } catch (err) {
      const status = err?.status || err?.response?.status;
      if (status === 404) return [];
      throw err;
    }
  }

  async deleteCollection(collectionName) {
    if (!this.qdrant) {
      this.collections.delete(collectionName);
      return;
    }

    try {
      await this.qdrant.deleteCollection(collectionName);
    } catch (err) {
      const status = err?.status || err?.response?.status;
      if (status !== 404) throw err;
    } finally {
      this.qdrantCollections.delete(collectionName);
    }
  }

  async hasCollection(collectionName) {
    if (!this.qdrant) return this.collections.has(collectionName);
    if (this.qdrantCollections.has(collectionName)) return true;

    try {
      await this.qdrant.getCollection(collectionName);
      this.qdrantCollections.add(collectionName);
      return true;
    } catch (err) {
      const status = err?.status || err?.response?.status;
      if (status === 404) return false;
      throw err;
    }
  }

  async getCollectionStats(collectionName) {
    if (!this.qdrant) {
      const collection = this.collections.get(collectionName);
      if (!collection) return null;
      return { documentCount: collection.length, dimensions: collection[0]?.embedding?.length || 0 };
    }

    try {
      const info = await this.qdrant.getCollection(collectionName);
      const result = info?.result ?? info;
      const vectors = result?.config?.params?.vectors;
      const size = typeof vectors?.size === "number"
        ? vectors.size
        : typeof vectors?.default?.size === "number"
          ? vectors.default.size
          : 0;
      const count = result?.points_count ?? result?.pointsCount ?? null;
      return { documentCount: count ?? 0, dimensions: size };
    } catch (err) {
      const status = err?.status || err?.response?.status;
      if (status === 404) return null;
      throw err;
    }
  }

  async listCollections() {
    if (!this.qdrant) return Array.from(this.collections.keys());

    const response = await this.qdrant.getCollections();
    const collections = response?.collections
      ?? response?.result?.collections
      ?? response?.result
      ?? [];
    const names = collections.map((c) => c.name ?? c).filter(Boolean);
    names.forEach((name) => this.qdrantCollections.add(name));
    return names;
  }

  async ensureCollection(collectionName, vectorSize) {
    if (this.qdrantCollections.has(collectionName)) return;

    try {
      const info = await this.qdrant.getCollection(collectionName);
      const result = info?.result ?? info;
      const vectors = result?.config?.params?.vectors;
      const existingSize = typeof vectors?.size === "number"
        ? vectors.size
        : typeof vectors?.default?.size === "number"
          ? vectors.default.size
          : null;
      if (existingSize && existingSize !== vectorSize) {
        throw new Error(`Qdrant collection ${collectionName} expects ${existingSize} dims, got ${vectorSize}.`);
      }
    } catch (err) {
      const status = err?.status || err?.response?.status;
      if (status !== 404 && status !== 400) throw err;
      await this.qdrant.createCollection(collectionName, {
        vectors: { size: vectorSize, distance: "Cosine" },
      });
    }

    this.qdrantCollections.add(collectionName);
  }

  getPointId(rawId) {
    if (typeof rawId === "number" && Number.isInteger(rawId) && rawId >= 0) return rawId;
    if (typeof rawId === "string" && isUuid(rawId)) return rawId;
    return randomUUID();
  }
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function cosineSimilarity(a, b) {
  if (a.length !== b.length) throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}
