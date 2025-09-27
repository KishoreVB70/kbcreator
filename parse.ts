import "dotenv/config";

// Highest-quality PDF -> chunks:
// 1) LlamaParse (Agentic Plus preset, resultType='markdown')
// 2) MarkdownNodeParser (split on headers; keep section hierarchy)
// 3) SentenceSplitter (~token-sized, sentence-aware)

import { LlamaParseReader } from "llama-cloud-services";

import {
  Document,
  TextNode,
  SentenceSplitter,
} from "llamaindex";
import { MarkdownNodeParser } from "llamaindex"; // TS has a Markdown-aware node parser

type Chunk = {
  id: string;
  text: string;
  metadata: Record<string, any>;
};

export async function parseAndChunkHighestQuality(
  filePath: string,
  {
    // token-ish sizing; tweak within 800–1200 tokens for KB docs
    chunkSize = 1000,
    chunkOverlap = 150,
  } = {}
): Promise<Chunk[]> {
  // 1) Parse PDFs with LlamaParse (set Agentic Plus preset in Cloud UI)
  const reader = new LlamaParseReader({
    apiKey: process.env.LLAMA_CLOUD_API_KEY,
    resultType: "markdown", // preserves headings/tables nicely
    // NOTE: Highest-fidelity preset is selected in LlamaCloud UI (Agentic Plus)
  });

  const documents: Document[] = await reader.loadData(filePath);

  // 2) Split by Markdown headings first (structure-aware nodes)
  const mdParser = new MarkdownNodeParser();
  const headingNodes: TextNode[] = mdParser.getNodesFromDocuments(documents);

  // 3) Then sentence-aware token chunks for embed budget friendliness
  const sentence = new SentenceSplitter({
    chunkSize,      // tokens
    chunkOverlap,   // tokens
  });

  const finalNodes = sentence.getNodesFromDocuments(headingNodes);


  // Normalize for your pipeline
  const chunks: Chunk[] = finalNodes.map((n, i) => ({
    id: n.id_ ?? `chunk-${i}`,
    text: n.getText(),
    metadata: {
      ...n.metadata, // often includes page numbers + header hierarchy from markdown pass
      ordinal: i,
    },
  }));

  return chunks;
}
