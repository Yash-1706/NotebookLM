export class RecursiveCharacterTextSplitter {
  constructor({ chunkSize = 1000, chunkOverlap = 200, separators = null } = {}) {
    this.chunkSize = chunkSize;
    this.chunkOverlap = chunkOverlap;
    this.separators = separators || ["\n\n", "\n", ". ", " ", ""];
  }

  splitText(text) {
    const finalChunks = [];
    this._splitRecursive(text, this.separators, finalChunks);
    return this._mergeWithOverlap(finalChunks);
  }

  _splitRecursive(text, separators, finalChunks) {
    if (text.length <= this.chunkSize) {
      if (text.trim().length > 0) finalChunks.push(text.trim());
      return;
    }

    let bestSeparator = separators[separators.length - 1];
    let remainingSeparators = [];

    for (let i = 0; i < separators.length; i++) {
      if (separators[i] === "" || text.includes(separators[i])) {
        bestSeparator = separators[i];
        remainingSeparators = separators.slice(i + 1);
        break;
      }
    }

    const splits = bestSeparator === "" ? text.split("") : text.split(bestSeparator);
    let currentChunk = "";

    for (const split of splits) {
      const piece = currentChunk ? currentChunk + bestSeparator + split : split;

      if (piece.length <= this.chunkSize) {
        currentChunk = piece;
      } else {
        if (currentChunk.trim().length > 0) {
          if (currentChunk.length > this.chunkSize && remainingSeparators.length > 0) {
            this._splitRecursive(currentChunk, remainingSeparators, finalChunks);
          } else {
            finalChunks.push(currentChunk.trim());
          }
        }
        if (split.length > this.chunkSize && remainingSeparators.length > 0) {
          this._splitRecursive(split, remainingSeparators, finalChunks);
          currentChunk = "";
        } else {
          currentChunk = split;
        }
      }
    }

    if (currentChunk.trim().length > 0) {
      if (currentChunk.length > this.chunkSize && remainingSeparators.length > 0) {
        this._splitRecursive(currentChunk, remainingSeparators, finalChunks);
      } else {
        finalChunks.push(currentChunk.trim());
      }
    }
  }

  _mergeWithOverlap(chunks) {
    if (chunks.length <= 1 || this.chunkOverlap === 0) return chunks;

    const result = [chunks[0]];
    for (let i = 1; i < chunks.length; i++) {
      const prevChunk = chunks[i - 1];
      const overlapText = prevChunk.slice(-this.chunkOverlap);
      const merged = overlapText + " " + chunks[i];
      result.push(merged.length <= this.chunkSize * 1.5 ? merged.trim() : chunks[i]);
    }
    return result;
  }
}

export function chunkDocument(pages, options = {}) {
  const splitter = new RecursiveCharacterTextSplitter(options);
  const chunks = [];
  let chunkIndex = 0;

  for (const page of pages) {
    const pageChunks = splitter.splitText(page.text);
    for (const chunk of pageChunks) {
      chunks.push({
        content: chunk,
        metadata: { page: page.page, chunkIndex: chunkIndex++ },
      });
    }
  }
  return chunks;
}
