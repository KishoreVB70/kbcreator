import { QdrantClient } from '@qdrant/js-client-rest';
import { OpenAI } from 'openai';
import "dotenv/config";


const qdrantClient = new QdrantClient({
  url: process.env.QDRANT_URL_PRO,
  apiKey: process.env.QDRANT_API_KEY_PRO
});

type StringRecord = Record<string, any>;
export async function insertVector(
  vectors: number[][],
  ids: string[],
  payloads: StringRecord[],
) {

  const points = vectors.map((vector, idx) => ({
    id: ids[idx],
    vector: vector,
    payload: payloads[idx] || {}
  }));

  await qdrantClient.upsert('kb_files', {
    points
  });
}


export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
export async function embedBatch(texts: string[]): Promise<number[][] | null> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: texts
    });
    return response.data.map((item) => item.embedding);
  } catch (e) {
    console.error(`Error generating embeddings for input texts: "${texts.join(', ')}"`, e);
    return [];
  }
}