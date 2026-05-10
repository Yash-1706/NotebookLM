/* ═══════════════════════════════════════════════════════════════════════════
   NotebookLM RAG — Frontend Application
   ═══════════════════════════════════════════════════════════════════════════ */

const API = "";

// ── State ───────────────────────────────────────────────────────────────────
let activeDocumentId = null;
let isProcessing = false;
let isQuerying = false;

// ── DOM Elements ────────────────────────────────────────────────────────────
const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const documentsList = document.getElementById("documentsList");
const emptyDocState = document.getElementById("emptyDocState");
const messagesContainer = document.getElementById("messagesContainer");
const messages = document.getElementById("messages");
const welcomeScreen = document.getElementById("welcomeScreen");
const queryInput = document.getElementById("queryInput");
const sendBtn = document.getElementById("sendBtn");
const chatTitle = document.getElementById("chatTitle");
const chatSubtitle = document.getElementById("chatSubtitle");
const processingOverlay = document.getElementById("processingOverlay");
const processingTitle = document.getElementById("processingTitle");
const processingStatus = document.getElementById("processingStatus");
const progressFill = document.getElementById("progressFill");
const menuToggle = document.getElementById("menuToggle");
const sidebar = document.getElementById("sidebar");

// ── File Upload ─────────────────────────────────────────────────────────────
dropZone.addEventListener("click", () => fileInput.click());

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("drag-over");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("drag-over");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  const files = Array.from(e.dataTransfer.files);
  if (files.length > 0) uploadFiles(files);
});

fileInput.addEventListener("change", (e) => {
  const files = Array.from(e.target.files);
  if (files.length > 0) uploadFiles(files);
  fileInput.value = "";
});

async function uploadFiles(files) {
  const validFiles = files.filter(file => {
    const ext = file.name.split(".").pop().toLowerCase();
    if (!["pdf", "txt"].includes(ext)) {
      showToast(`Skipped ${file.name} (unsupported format)`, "error");
      return false;
    }
    if (file.size > 20 * 1024 * 1024) {
      showToast(`Skipped ${file.name} (exceeds 20MB)`, "error");
      return false;
    }
    return true;
  });

  if (validFiles.length === 0) return;

  showProcessing(
    validFiles.length === 1 ? "Processing Document" : `Processing ${validFiles.length} Documents`, 
    "Uploading..."
  );
  setProgress(10);

  const formData = new FormData();
  validFiles.forEach(file => formData.append("files", file));

  try {
    setProgress(30);
    updateProcessingStatus("Parsing and chunking documents...");

    const res = await fetch(`${API}/api/upload`, {
      method: "POST",
      body: formData,
    });

    setProgress(70);
    updateProcessingStatus("Generating embeddings...");

    const data = await res.json();

    if (!res.ok) throw new Error(data.error || "Upload failed");

    setProgress(100);
    updateProcessingStatus("Done!");

    setTimeout(() => {
      hideProcessing();
      data.documents.forEach(doc => addDocumentCard(doc));
      
      // Auto-select the first newly uploaded document
      if (data.documents.length > 0) {
        selectDocument(data.documents[0].id, data.documents[0].name);
      }
      
      showToast(`Successfully processed ${data.documents.length} document(s)`, "success");
    }, 500);
  } catch (err) {
    hideProcessing();
    showToast(err.message, "error");
    console.error("Upload error:", err);
  }
}

// ── Documents Management ────────────────────────────────────────────────────
function addDocumentCard(doc) {
  emptyDocState.classList.add("hidden");

  const card = document.createElement("div");
  card.className = "doc-card";
  card.dataset.id = doc.id;
  card.innerHTML = `
    <div class="doc-card-icon">${doc.name.endsWith(".pdf") ? "📕" : "📄"}</div>
    <div class="doc-card-info">
      <div class="doc-card-name" title="${doc.name}">${doc.name}</div>
      <div class="doc-card-meta">${doc.pageCount} page${doc.pageCount !== 1 ? "s" : ""} · ${doc.chunkCount} chunks</div>
    </div>
    <button class="doc-delete-btn" title="Delete document" onclick="event.stopPropagation(); deleteDocument('${doc.id}')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
    </button>
  `;

  card.addEventListener("click", () => selectDocument(doc.id, doc.name));
  documentsList.appendChild(card);
}

function selectDocument(id, name) {
  activeDocumentId = id;

  // Update active card styling
  document.querySelectorAll(".doc-card").forEach((c) => {
    c.classList.toggle("active", c.dataset.id === id);
  });

  // Update header
  chatTitle.textContent = name;
  chatSubtitle.textContent = "Ask questions about this document";

  // Enable input
  queryInput.disabled = false;
  sendBtn.disabled = false;
  queryInput.focus();

  // Show welcome or keep existing messages
  if (welcomeScreen) {
    welcomeScreen.style.display = "none";
  }

  // Close mobile sidebar
  sidebar.classList.remove("open");
}

async function deleteDocument(id) {
  try {
    const res = await fetch(`${API}/api/documents/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Delete failed");

    // Remove card
    const card = document.querySelector(`.doc-card[data-id="${id}"]`);
    if (card) card.remove();

    // If this was the active document, reset
    if (activeDocumentId === id) {
      activeDocumentId = null;
      chatTitle.textContent = "NotebookLM";
      chatSubtitle.textContent = "Upload a document to start chatting";
      queryInput.disabled = true;
      sendBtn.disabled = true;
      clearMessages();
    }

    // Show empty state if no documents
    if (documentsList.querySelectorAll(".doc-card").length === 0) {
      emptyDocState.classList.remove("hidden");
    }

    showToast("Document deleted", "success");
  } catch (err) {
    showToast("Failed to delete document", "error");
  }
}

// ── Chat ────────────────────────────────────────────────────────────────────
sendBtn.addEventListener("click", sendMessage);

queryInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Auto-resize textarea
queryInput.addEventListener("input", () => {
  queryInput.style.height = "auto";
  queryInput.style.height = Math.min(queryInput.scrollHeight, 120) + "px";
});

async function sendMessage() {
  const query = queryInput.value.trim();
  if (!query || !activeDocumentId || isQuerying) return;

  isQuerying = true;
  sendBtn.disabled = true;

  // Add user message
  addMessage("user", query);
  queryInput.value = "";
  queryInput.style.height = "auto";

  // Add loading indicator
  const loadingId = addLoadingMessage();

  try {
    const res = await fetch(`${API}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, documentId: activeDocumentId }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to get answer");

    removeLoadingMessage(loadingId);
    addMessage("assistant", data.answer, data.sources);
  } catch (err) {
    removeLoadingMessage(loadingId);
    addMessage("assistant", `⚠️ Error: ${err.message}`);
  } finally {
    isQuerying = false;
    sendBtn.disabled = false;
    queryInput.focus();
  }
}

function addMessage(role, content, sources = null) {
  const msg = document.createElement("div");
  msg.className = `message ${role}`;

  const avatar = role === "user" ? "👤" : "🤖";
  const sender = role === "user" ? "You" : "NotebookLM";

  let sourcesHTML = "";
  if (sources && sources.length > 0) {
    sourcesHTML = `
      <div class="sources-panel">
        <button class="sources-toggle" onclick="toggleSources(this)">
          <span class="chevron">▶</span>
          📚 ${sources.length} source${sources.length > 1 ? "s" : ""} referenced
        </button>
        <div class="sources-list">
          ${sources
            .map(
              (s) => `
            <div class="source-item">
              <div class="source-item-header">
                <span class="source-page">Page ${s.page}</span>
                <span class="source-score">${s.score}% match</span>
              </div>
              <div class="source-content">${escapeHtml(s.content)}</div>
            </div>
          `
            )
            .join("")}
        </div>
      </div>
    `;
  }

  msg.innerHTML = `
    <div class="message-avatar">${avatar}</div>
    <div class="message-body">
      <div class="message-sender">${sender}</div>
      <div class="message-content">${formatMarkdown(content)}</div>
      ${sourcesHTML}
    </div>
  `;

  messages.appendChild(msg);
  scrollToBottom();
}

function addLoadingMessage() {
  const id = "loading-" + Date.now();
  const msg = document.createElement("div");
  msg.className = "message assistant";
  msg.id = id;
  msg.innerHTML = `
    <div class="message-avatar">🤖</div>
    <div class="message-body">
      <div class="message-sender">NotebookLM</div>
      <div class="loading-indicator">Thinking...</div>
    </div>
  `;
  messages.appendChild(msg);
  scrollToBottom();
  return id;
}

function removeLoadingMessage(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function clearMessages() {
  messages.innerHTML = "";
  if (welcomeScreen) {
    messages.appendChild(welcomeScreen);
    welcomeScreen.style.display = "flex";
  }
}

function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// ── Sources Toggle ──────────────────────────────────────────────────────────
window.toggleSources = function (btn) {
  btn.classList.toggle("open");
  const list = btn.nextElementSibling;
  list.classList.toggle("open");
};

// ── Processing Overlay ──────────────────────────────────────────────────────
function showProcessing(title, status) {
  processingTitle.textContent = title;
  processingStatus.textContent = status;
  progressFill.style.width = "0%";
  processingOverlay.classList.add("active");
}

function updateProcessingStatus(status) {
  processingStatus.textContent = status;
}

function setProgress(percent) {
  progressFill.style.width = percent + "%";
}

function hideProcessing() {
  processingOverlay.classList.remove("active");
}

// ── Toast Notifications ─────────────────────────────────────────────────────
function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    padding: 14px 24px;
    border-radius: 12px;
    font-size: 0.9rem;
    font-weight: 500;
    font-family: var(--font-sans);
    color: #ffffff;
    z-index: 200;
    animation: slideUp 0.3s var(--ease-out);
    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    max-width: 360px;
    background: ${type === "error" ? "rgba(242, 158, 157, 0.2)" : type === "success" ? "rgba(0, 244, 210, 0.2)" : "rgba(117, 198, 250, 0.2)"};
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid ${type === "error" ? "rgba(242, 158, 157, 0.4)" : type === "success" ? "rgba(0, 244, 210, 0.4)" : "rgba(117, 198, 250, 0.4)"};
  `;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(12px)";
    toast.style.transition = "all 0.3s var(--ease-out)";
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Simple markdown-to-HTML conversion for chat messages.
 */
function formatMarkdown(text) {
  return text
    // Code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    // Bold
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Italic
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Unordered lists
    .replace(/^[\s]*[-*]\s+(.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>")
    // Ordered lists
    .replace(/^\d+\.\s+(.+)$/gm, "<li>$1</li>")
    // Headings
    .replace(/^### (.+)$/gm, "<h4>$1</h4>")
    .replace(/^## (.+)$/gm, "<h3>$1</h3>")
    .replace(/^# (.+)$/gm, "<h2>$1</h2>")
    // Page citations
    .replace(/\[Page (\d+)\]/g, '<span class="source-page">[Page $1]</span>')
    // Line breaks → paragraphs
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br/>")
    .replace(/^(.+)$/, "<p>$1</p>");
}

// ── Mobile Sidebar Toggle ───────────────────────────────────────────────────
menuToggle.addEventListener("click", () => {
  sidebar.classList.toggle("open");
});

// Close sidebar on outside click (mobile)
document.addEventListener("click", (e) => {
  if (
    window.innerWidth <= 768 &&
    sidebar.classList.contains("open") &&
    !sidebar.contains(e.target) &&
    e.target !== menuToggle
  ) {
    sidebar.classList.remove("open");
  }
});

// ── Load existing documents on page load ────────────────────────────────────
async function loadDocuments() {
  try {
    const res = await fetch(`${API}/api/documents`);
    const docs = await res.json();
    docs.forEach(addDocumentCard);
  } catch (err) {
    console.error("Failed to load documents:", err);
  }
}

loadDocuments();
