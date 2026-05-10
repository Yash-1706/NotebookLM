import "dotenv/config";
import express from "express";
import multer from "multer";
import cors from "cors";
import fs from "fs";
import { fileURLToPath } from "url";
import { dirname, join, extname } from "path";
import { v4 as uuidv4 } from "uuid";

import { chunkDocument } from "./src/chunker.js";
import { getEmbeddings, warmupEmbeddings, isModelReady } from "./src/embeddings.js";
import { VectorStore } from "./src/vectorStore.js";
import { ragQuery } from "./src/rag.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, "public")));

const uploadsDir = join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({ dest: uploadsDir, limits: { fileSize: 20 * 1024 * 1024 } });

const vectorStore = new VectorStore();
const documents = new Map();

async function parsePDF(filePath) {
  const pdfParse = (await import("pdf-parse")).default;
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  const rawPages = data.text.split(/\f/);
  const pages = rawPages
    .map((text, i) => ({ text: text.trim(), page: i + 1 }))
    .filter((p) => p.text.length > 0);
  return { pages, pageCount: data.numpages };
}

function parseTextFile(filePath) {
  const text = fs.readFileSync(filePath, "utf-8");
  return { pages: [{ text, page: 1 }], pageCount: 1 };
}

app.get("/api/status", (req, res) => {
  res.json({ ready: isModelReady(), documents: documents.size });
});

app.post("/api/upload", upload.array("files"), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    const processedDocs = [];

    for (const file of req.files) {
      const ext = extname(file.originalname).toLowerCase();
      if (![".pdf", ".txt"].includes(ext)) {
        fs.unlinkSync(file.path);
        console.warn(`Skipping unsupported file: ${file.originalname}`);
        continue;
      }

      const docId = uuidv4();
      console.log(`Processing: ${file.originalname} (${docId})`);

      const parsed = ext === ".pdf"
        ? await parsePDF(file.path)
        : parseTextFile(file.path);

      const chunks = chunkDocument(parsed.pages, { chunkSize: 1000, chunkOverlap: 200 });
      console.log(`  Created ${chunks.length} chunks`);

      const embeddings = await getEmbeddings(chunks.map((c) => c.content));
      console.log(`  Generated ${embeddings.length} embeddings`);

      const vectorDocs = chunks.map((chunk, i) => ({
        id: `${docId}-${i}`,
        embedding: embeddings[i],
        content: chunk.content,
        metadata: chunk.metadata,
      }));
      vectorStore.addDocuments(docId, vectorDocs);
      console.log(`  Stored in vector database`);

      const docMeta = {
        id: docId,
        name: file.originalname,
        pageCount: parsed.pageCount,
        chunkCount: chunks.length,
        uploadedAt: new Date().toISOString(),
      };
      
      documents.set(docId, docMeta);
      processedDocs.push(docMeta);

      fs.unlinkSync(file.path);
    }

    if (processedDocs.length === 0) {
      return res.status(400).json({ error: "No supported files were uploaded (only PDF and TXT are allowed)." });
    }

    res.json({ success: true, documents: processedDocs });
  } catch (err) {
    console.error("Upload error:", err);
    if (req.files) {
      req.files.forEach(f => {
        if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
      });
    }
    res.status(500).json({ error: "Failed to process documents: " + err.message });
  }
});

app.post("/api/chat", async (req, res) => {
  try {
    const { query, documentId } = req.body;
    if (!query) return res.status(400).json({ error: "Query is required" });
    if (!documentId) return res.status(400).json({ error: "Document ID is required" });
    if (!documents.has(documentId)) return res.status(404).json({ error: "Document not found" });

    console.log(`Query: "${query}" -> ${documents.get(documentId).name}`);
    const result = await ragQuery(query, vectorStore, documentId, 5);
    res.json({ success: true, answer: result.answer, sources: result.sources });
  } catch (err) {
    console.error("Chat error:", err.message);
    res.status(500).json({ error: "Failed to generate answer: " + err.message });
  }
});

app.get("/api/documents", (req, res) => {
  res.json(Array.from(documents.values()));
});

app.delete("/api/documents/:id", (req, res) => {
  const { id } = req.params;
  if (!documents.has(id)) return res.status(404).json({ error: "Document not found" });
  vectorStore.deleteCollection(id);
  documents.delete(id);
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;

warmupEmbeddings()
  .then(() => {
    app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
  })
  .catch(() => {
    app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
  });
