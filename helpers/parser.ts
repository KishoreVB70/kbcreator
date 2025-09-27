import { LlamaParseReader } from "llama-cloud-services";
  
export const parser = new LlamaParseReader({
    apiKey: process.env.LLAMA_CLOUD_API_KEY,
    resultType: "markdown",
    parse_mode: "parse_document_with_agent",
    model: "anthropic-sonnet-4.0",
    high_res_ocr: true, // for scanned PDFs
    adaptive_long_table: true, // for complex tables
    outlined_table_extraction: true, // for structured tables
    output_tables_as_HTML: true, // for better table formatting
});
