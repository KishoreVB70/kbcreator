import "dotenv/config";
import {QdrantVectorStore} from '@llamaindex/qdrant';
import { openaiEmbedding } from "./embedder";
import { QdrantClient } from "@qdrant/js-client-rest";


export const vectorDBLLAMA = new QdrantVectorStore({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY,
  collectionName: 'kb_docs_v1',
  embedModel: openaiEmbedding,
});

export const vectorDB = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY
})
