export class VectorStore {
  constructor() {
    this.collections = new Map();
  }

  addDocuments(collectionName, documents) {
    if (!this.collections.has(collectionName)) {
      this.collections.set(collectionName, []);
    }
    this.collections.get(collectionName).push(...documents);
  }

  search(collectionName, queryEmbedding, k = 5) {
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

  deleteCollection(collectionName) {
    this.collections.delete(collectionName);
  }

  hasCollection(collectionName) {
    return this.collections.has(collectionName);
  }

  getCollectionStats(collectionName) {
    const collection = this.collections.get(collectionName);
    if (!collection) return null;
    return { documentCount: collection.length, dimensions: collection[0]?.embedding?.length || 0 };
  }

  listCollections() {
    return Array.from(this.collections.keys());
  }
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
