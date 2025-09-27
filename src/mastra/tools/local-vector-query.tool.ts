import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { embedMany } from "ai";

import { openAIEmbeddingProvider } from "../config/openai";
import { logger } from "../config/logger";

export const localVectorQueryTool = createTool({
  id: "local-vector-query",
  description: "Query vector database for relevant documents (no security filters)",
  inputSchema: z.object({
    question: z.string()
  }),
  outputSchema: z.object({
    contexts: z.array(z.object({
      text: z.string(),
      docId: z.string(),
      versionId: z.string(),
      source: z.string(),
      score: z.number(),
      securityTags: z.array(z.string()),
      classification: z.enum(["public", "internal", "confidential"])
    }))
  }),
  execute: async ({ context, mastra }) => {
    try {
      const { question } = context;

      if (!question || question.trim().length === 0) {
        throw new Error("Question is required");
      }

      if (!process.env.QDRANT_URL) {
        throw new Error("QDRANT_URL environment variable not configured");
      }

      if (!mastra) {
        throw new Error("Mastra instance not available");
      }

      const store = mastra.getVector("qdrant");
      if (!store) {
        throw new Error("Vector store not initialized");
      }

      const indexName = process.env.QDRANT_COLLECTION || "governed_rag";
      const topK = parseInt(process.env.RETRIEVAL_TOP_K || '8');
      const minSimilarity = parseFloat(process.env.VECTOR_SIMILARITY_THRESHOLD || '0.4');

      logger.info('🔍 Local query parameters', { question, topK, minSimilarity });

      // Generate embedding for the question
      const embeddingModel = process.env.EMBEDDING_MODEL || "text-embedding-3-small";
      const { embeddings } = await embedMany({
        model: openAIEmbeddingProvider.embedding(embeddingModel),
        values: [question]
      });
      const embedding = embeddings[0] as number[];

      // Query without any filters - get all documents based on similarity
      const results = await (store as any).query({
        indexName: indexName,
        queryVector: embedding,
        topK: topK,
        includeVector: false
      });

      logger.info(`🔍 Query returned ${results?.length || 0} results`);

      if (!results || results.length === 0) {
        return { contexts: [] };
      }

      // Apply similarity threshold filtering
      const filteredResults = results.filter((r: any) => {
        const score = r.score || 0;
        return score >= minSimilarity;
      });

      logger.info(`🔍 After similarity filtering (>=${minSimilarity}): ${filteredResults.length}/${results.length} documents kept`);

      // Transform results to expected format
      const contexts = filteredResults.map((r: any) => {
        let securityTags: string[] = [];

        if (Array.isArray(r.metadata?.securityTags)) {
          securityTags = r.metadata.securityTags;
        } else if (typeof r.metadata?.securityTags === 'string') {
          securityTags = r.metadata.securityTags.split(',').map((tag: string) => tag.trim());
        }

        return {
          text: String(r.metadata?.text || ""),
          docId: String(r.metadata?.docId || "unknown"),
          versionId: r.metadata?.versionId ? String(r.metadata.versionId) : "unknown",
          source: r.metadata?.source ? String(r.metadata.source) : "unknown",
          score: r.score || 0,
          securityTags,
          classification: (r.metadata?.classification as "public" | "internal" | "confidential") || "public"
        };
      });

      logger.info(`🔍 Returning ${contexts.length} contexts`);
      return { contexts };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Vector query failed: ${error.message}`);
      }
      throw new Error("Vector query failed: Unknown error");
    }
  }
});