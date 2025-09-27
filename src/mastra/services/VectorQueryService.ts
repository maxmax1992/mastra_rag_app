import { embedMany } from "ai";

import { openAIEmbeddingProvider } from "../config/openai";
import { ValidationService } from "./ValidationService";
import { logger } from "../config/logger";

export interface QueryInput {
  question: string;
  allowTags: string[];
  maxClassification: "public" | "internal" | "confidential";
  topK?: number;
  minSimilarity?: number;
}

export interface QueryResult {
  text: string;
  docId: string;
  versionId: string;
  source: string;
  score: number;
  securityTags: string[];
  classification: "public" | "internal" | "confidential";
}

export interface SecurityFilters {
  allowedClasses: string[];
  allowTags: string[];
}

export class VectorQueryService {
  static buildSecurityFilters(
    allowTags: string[],
    maxClassification: "public" | "internal" | "confidential"
  ): SecurityFilters {
    const allowedClasses: string[] = [];
    
    if (maxClassification === "public" || maxClassification === "internal" || maxClassification === "confidential") {
      allowedClasses.push("classification:public");
    }
    if (maxClassification === "internal" || maxClassification === "confidential") {
      allowedClasses.push("classification:internal");
    }
    if (maxClassification === "confidential") {
      allowedClasses.push("classification:confidential");
    }

    return {
      allowedClasses,
      allowTags
    };
  }

  static async generateQueryEmbedding(question: string): Promise<number[]> {
    const embeddingModel: string = process.env.EMBEDDING_MODEL || "text-embedding-3-small";
    const { embeddings } = await embedMany({
      model: openAIEmbeddingProvider.embedding(embeddingModel),
      values: [question]
    });
    return embeddings[0] as number[];
  }

  static async searchWithFilters(
    embedding: number[],
    _filters: SecurityFilters,
    vectorStore: unknown,
    indexName: string,
    topK: number,
    minSimilarity: number = 0.4
  ): Promise<QueryResult[]> {
    logger.info('🔍 LOCAL MODE: Retrieving all documents without filters');

    // No filters - retrieve all documents based on similarity only
    const results = await (vectorStore as any).query({
      indexName: indexName,
      queryVector: embedding,
      topK: topK,
      includeVector: false
    });

    logger.info(`🔍 Query returned ${results?.length || 0} results before similarity filtering`);

    if (!results || results.length === 0) {
      logger.info('🔍 No documents found');
      return [];
    }

    // Apply similarity threshold filtering
    const similarityFilteredResults = results.filter((r: any) => {
      const score = r.score || 0;
      logger.debug(`🔍 Document ${r.metadata?.docId}: score=${score.toFixed(3)}, threshold=${minSimilarity}, ${score >= minSimilarity ? 'KEEP' : 'FILTER_OUT'}`);
      return score >= minSimilarity;
    });

    logger.info(`🔍 After similarity filtering (>=${minSimilarity}): ${similarityFilteredResults.length}/${results.length} documents kept`);

    if (similarityFilteredResults.length === 0) {
      logger.info('🔍 No relevant documents found', {
        similarityThreshold: minSimilarity,
        highestScore: Math.max(...results.map((r: any) => r.score || 0)).toFixed(3)
      });
      return [];
    }

    logger.info('🔍 LOCAL MODE: Retrieved documents', {
      documentsRetrieved: similarityFilteredResults.length
    });

    return similarityFilteredResults.map((r: any) => {
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
  }

  static async query(
    input: QueryInput,
    vectorStore: unknown,
    indexName: string
  ): Promise<QueryResult[]> {
    ValidationService.validateQuestion(input.question);
    ValidationService.validateAccessTags(input.allowTags);
    ValidationService.validateVectorStore(vectorStore);

    const filters: SecurityFilters = this.buildSecurityFilters(input.allowTags, input.maxClassification);
    const embedding = await this.generateQueryEmbedding(input.question);
    
    return await this.searchWithFilters(
      embedding,
      filters,
      vectorStore,
      indexName,
      input.topK || 8,
      input.minSimilarity || 0.4
    );
  }
}