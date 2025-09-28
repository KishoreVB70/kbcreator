import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { Document, MarkdownNodeParser, SentenceSplitter, TextNode } from 'llamaindex';
import { vectorDB } from './helpers/vectorStore';
import { openaiLlm } from './helpers/embedder';
import { v5 } from 'uuid';


// ----- config knobs -----
const KB_DIR = './assets';
const COLLECTION = 'kb_docs_v1';
const CHUNK_SIZE = 512;
const CHUNK_OVERLAP = 64;
const EMBED_BATCH = 128;     // OpenAI embeddings batch size
const UPSERT_BATCH = 2000;   // Qdrant upsert batch size (payload-only limit friendly)

// ----- helpers -----
const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-').replace(/-+/g, '-');

const stableId = (payload: { path: string; sectionIndex: number; chunkIndex: number; text: string }) => {
  const name = `${payload.path}|s${payload.sectionIndex}|c${payload.chunkIndex}`;
  const BASE_NS = '6f1a73a1-8d1b-4c31-9b00-1c4c2e0f9b12';
  return v5(name, BASE_NS)
};

async function loadMarkdownDocs(dir = KB_DIR): Promise<Document[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const docs: Document[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (path.extname(entry.name) !== '.md') continue;
    const abs = path.join(dir, entry.name);
    const text = await fs.readFile(abs, 'utf-8');
    docs.push(new Document({ text, metadata: { path: entry.name, fileName: entry.name, ext: '.md' } }));
  }
  return docs;
}

function inferSectionTitle(nodeText: string, filePath: string): string {
  const m = nodeText.match(/^#{1,6}\s+(.+?)\s*$/m);
  return (m?.[1] ?? path.parse(filePath).name).trim();
}

// keep prototype: mutate nodes
function splitSection(splitter: SentenceSplitter, sectionNode: TextNode): TextNode[] {
  const doc = new Document({ text: sectionNode.getText(), metadata: { ...(sectionNode.metadata ?? {}) } });
  const chunkNodes = splitter.getNodesFromDocuments([doc]) as TextNode[];
  for (const n of chunkNodes) {
    n.metadata = { ...(sectionNode.metadata ?? {}), ...(n.metadata ?? {}) };
    n.text = n.getText().trim();
  }
  // drop empties (e.g., headings-only or whitespace)
  return chunkNodes.filter((n) => n.getText().length > 0);
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// simple retry with exponential backoff
async function withRetry<T>(fn: () => Promise<T>, label: string, tries = 4): Promise<T> {
  let attempt = 0, lastErr: unknown;
  while (attempt < tries) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const wait = Math.min(2000 * 2 ** attempt, 15000);
      console.warn(`[${label}] attempt ${attempt + 1} failed; retrying in ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
      attempt++;
    }
  }
  throw lastErr;
}

async function main() {
  // 1) load
  const docs = await loadMarkdownDocs();
  if (docs.length === 0) {
    console.warn('No .md files in ./assets');
    return;
  }

  // 2) heading-aware → token-aware chunks
  const md = new MarkdownNodeParser();
  const sections = md.getNodesFromDocuments(docs) as TextNode[];

  const splitter = new SentenceSplitter({ chunkSize: CHUNK_SIZE, chunkOverlap: CHUNK_OVERLAP });
  const chunks: TextNode[] = [];
  const perFileSection = new Map<string, number>();

  for (const sec of sections) {
    const filePath = (sec.metadata?.path as string) ?? 'unknown.md';
    const { name: fileName, ext: _ext } = path.parse(filePath);
    const sectionTitle = inferSectionTitle(sec.getText(), filePath);
    const sectionAnchor = slugify(sectionTitle);
    const sectionIndex = (perFileSection.get(filePath) ?? 0) + 1;
    perFileSection.set(filePath, sectionIndex);

    const parts = splitSection(splitter, sec);
    let chunkIndex = 0;
    for (const c of parts) {
      chunkIndex += 1;
      // 1) original content trimmed
      const raw = c.getText().trim();

      c.text = `${fileName}||${raw}`;

      c.metadata = {
        ...c.metadata,
        path: filePath,
        fileName,
        sectionTitle,
        sectionAnchor,
        sectionIndex,
        chunkIndex,
        source: 'kb',
      };
      c.text = c.getText().trim();
      if (c.text.length > 0) chunks.push(c);
    }
  }

  if (chunks.length === 0) {
    console.warn('No non-empty chunks produced. Check your Markdown and splitter settings.');
    return;
  }

  // 3) embed (OpenAI) with batch + retry + alignment checks
  const texts = chunks.map((c) => c.getText());
  const textBatches = chunkArray(texts, EMBED_BATCH);
  const vectors: number[][] = [];

  for (let b = 0; b < textBatches.length; b++) {
    const slice = textBatches[b];
    const res = await withRetry(
      () => openaiLlm.embeddings.create({ model: 'text-embedding-3-small', input: slice }),
      `embed-batch-${b + 1}/${textBatches.length}`
    );
    if (!res.data || res.data.length !== slice.length) {
      throw new Error(`Embedding size mismatch: got ${res.data?.length ?? 0}, expected ${slice.length}`);
    }
    for (const d of res.data) vectors.push(d.embedding);
  }

  if (vectors.length !== chunks.length) {
    throw new Error(`Vector/chunk misalignment: vectors=${vectors.length}, chunks=${chunks.length}`);
  }

  // 4) build points with deterministic ids + flat payload
  const allPoints = chunks.map((c, i) => {
    const payload = {
      text: c.getText(),
      ...(c.metadata ?? {}),
    } as {
      text: string;
      fileName: string;
      path: string;
      sectionTitle: string;
      sectionAnchor: string;
      sectionIndex: number;
      chunkIndex: number;
      source: string;
      ext?: string;
    };

    return {
      id: stableId({
        path: payload.path,
        sectionIndex: payload.sectionIndex,
        chunkIndex: payload.chunkIndex,
        text: payload.text,
      }),
      vector: vectors[i],
      payload,
    };
  });

  // 5) upsert in batches
  const pointBatches = chunkArray(allPoints, UPSERT_BATCH);
  let upserted = 0;
  for (let i = 0; i < pointBatches.length; i++) {
    await withRetry(() => vectorDB.upsert(COLLECTION, { points: pointBatches[i] }), `upsert-${i + 1}/${pointBatches.length}`);
    upserted += pointBatches[i].length;
  }

  console.log(`✅ Upserted ${upserted} chunks into ${COLLECTION} (flat payloads, deterministic ids).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
