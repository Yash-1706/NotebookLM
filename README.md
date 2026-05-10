# 📓 NotebookLM RAG — Chat with your Documents

A full-stack RAG (Retrieval-Augmented Generation) application inspired by Google NotebookLM. Upload any PDF or text document, and the system chunks, embeds, and indexes it — then lets you have a grounded conversation with its contents.

![Tech Stack](https://img.shields.io/badge/Node.js-Express-339933?logo=node.js)
![LLM](https://img.shields.io/badge/LLM-GPT--4.1--mini-7c3aed)
![Embeddings](https://img.shields.io/badge/Embeddings-MiniLM--L6--v2-blue)

---

## ✨ Features

- **Upload PDF or TXT** — drag & drop or click to browse
- **Automatic chunking** — Recursive Character Text Splitter with configurable overlap
- **Semantic embeddings** — local `all-MiniLM-L6-v2` model (no API key needed for embeddings)
- **Vector database** — in-memory vector store with cosine similarity search
- **Grounded answers** — LLM generates responses strictly from document context
- **Source citations** — every answer shows the source chunks and page numbers
- **Beautiful dark UI** — glassmorphism design with smooth animations
- **Responsive** — works on desktop and mobile

---

## 🏗️ Architecture

```
┌─────────────┐    ┌──────────────┐    ┌──────────────────┐    ┌──────────────┐
│   Upload     │ →  │   Chunking   │ →  │   Embedding      │ →  │ Vector Store │
│   (PDF/TXT)  │    │   Recursive  │    │   MiniLM-L6-v2   │    │   (In-Memory)│
└─────────────┘    │   Splitter   │    │   384 dimensions  │    │   Cosine Sim │
                   └──────────────┘    └──────────────────┘    └──────┬───────┘
                                                                      │
┌─────────────┐    ┌──────────────┐    ┌──────────────────┐          │
│   Answer +   │ ←  │   LLM Gen    │ ←  │   Retrieval      │ ←───────┘
│   Sources   │    │   GPT-4.1    │    │   Top-K Search   │
└─────────────┘    └──────────────┘    └──────────────────┘
```

---

## 📦 Chunking Strategy

**Recursive Character Text Splitter** — a well-established chunking approach that preserves semantic coherence.

### How it works:

1. **Separator hierarchy**: Tries to split on the most meaningful boundary first:
   - `\n\n` — Paragraph breaks (most meaningful)
   - `\n` — Line breaks
   - `. ` — Sentence boundaries
   - ` ` — Word boundaries
   - `""` — Character-level (last resort)

2. **Recursive splitting**: If a chunk exceeds the target size, it recursively tries smaller separators within that chunk.

3. **Overlap**: Consecutive chunks share `chunkOverlap` characters (default: 200) to preserve context that spans chunk boundaries.

### Parameters:
| Parameter | Default | Description |
|-----------|---------|-------------|
| `chunkSize` | 1000 | Target maximum characters per chunk |
| `chunkOverlap` | 200 | Characters of overlap between consecutive chunks |

This strategy ensures that semantically related content stays together, while the overlap prevents information loss at chunk boundaries.

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- An [OpenRouter](https://openrouter.ai) API key

### Installation

```bash
git clone https://github.com/<your-username>/notebooklm-rag.git
cd notebooklm-rag
npm install
```

### Configuration

Create a `.env` file:

```env
OPENROUTER_API_KEY=your_openrouter_api_key_here
PORT=3000
```

### Run

```bash
npm start
```

Open **http://localhost:3000** in your browser.

> **Note:** On first run, the embedding model (~80MB) will be downloaded and cached automatically.

---

## 📁 Project Structure

```
├── server.js              # Express server & API routes
├── src/
│   ├── chunker.js         # Recursive text splitter (chunking strategy)
│   ├── embeddings.js      # Local embedding model (all-MiniLM-L6-v2)
│   ├── vectorStore.js     # In-memory vector database with cosine similarity
│   └── rag.js             # RAG pipeline: retrieval + generation
├── public/
│   ├── index.html         # Web UI
│   ├── styles.css         # Dark theme design system
│   └── app.js             # Frontend logic
├── .env                   # API keys (not committed)
└── package.json
```

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/upload` | Upload and process a document |
| `POST` | `/api/chat` | Ask a question about a document |
| `GET` | `/api/documents` | List all uploaded documents |
| `DELETE` | `/api/documents/:id` | Delete a document |
| `GET` | `/api/status` | Server and model status |

---

## 🛠️ Tech Stack

| Component | Technology |
|-----------|-----------|
| Backend | Node.js + Express |
| Frontend | Vanilla HTML/CSS/JS |
| Embeddings | `@xenova/transformers` (all-MiniLM-L6-v2) |
| Vector DB | Custom in-memory store with cosine similarity |
| LLM | OpenRouter API (GPT-4.1-mini) |
| PDF Parsing | `pdf-parse` |

---