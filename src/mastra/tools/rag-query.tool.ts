import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { logger } from "../config/logger";

export const ragQueryTool = createTool({
  id: "rag-query",
  description: "Query the knowledge base using the RAG workflow to get factual information from documents",
  inputSchema: z.object({
    question: z.string().describe("The question to ask the knowledge base")
  }),
  outputSchema: z.object({
    answer: z.string(),
    citations: z.array(z.object({
      docId: z.string(),
      source: z.string()
    })),
    hasAnswer: z.boolean().describe("Whether the knowledge base had relevant information")
  }),
  execute: async ({ context, mastra }) => {
    try {
      const { question } = context;

      if (!mastra) {
        throw new Error("Mastra instance not available");
      }

      logger.info('🔍 RAG Query Tool invoked', { question });

      // Get the RAG workflow
      const workflow = mastra.getWorkflows()['local-rag-answer'];
      if (!workflow) {
        throw new Error("RAG workflow not found");
      }

      // Execute the workflow
      const run = await workflow.createRunAsync();
      const result = await run.start({
        inputData: { question }
      });

      if (result.status === 'success' && result.result) {
        const { answer, citations } = result.result;

        // Check if we actually found relevant information
        const hasAnswer = !answer.includes("No authorized documents found") &&
                         !answer.includes("don't contain information");

        logger.info('✅ RAG Query completed', {
          hasAnswer,
          citationsCount: citations?.length || 0
        });

        return {
          answer,
          citations: citations || [],
          hasAnswer
        };
      }

      // If workflow failed or no result
      logger.warn('⚠️ RAG Query returned no result');
      return {
        answer: "I couldn't retrieve information from the knowledge base at this time.",
        citations: [],
        hasAnswer: false
      };

    } catch (error) {
      logger.error('❌ RAG Query Tool error', error);
      return {
        answer: "I encountered an error while searching the knowledge base.",
        citations: [],
        hasAnswer: false
      };
    }
  }
});