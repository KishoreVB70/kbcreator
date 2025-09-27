import "dotenv/config";
import { OpenAIEmbedding } from "@llamaindex/openai";
import OpenAI from "openai";

export const openaiEmbedding = new OpenAIEmbedding({ apiKey: process.env.OPENAI_API_KEY, model: 'text-embedding-3-small' });
export const openaiLlm = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});