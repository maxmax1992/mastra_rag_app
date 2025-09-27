import { createWorkflow, createStep } from "@mastra/core";
import { z } from "zod";

import { answererAgent, answererOutputSchema } from "../agents/answerer.agent";
import { rerankAgent, rerankOutputSchema } from "../agents/rerank.agent";
import { localRetrieveAgent } from "../agents/local-retrieve.agent";
import { verifierAgent, verifierOutputSchema } from "../agents/verifier.agent";
import { logStepStart, logStepEnd, logAgentActivity, logError } from "../config/logger";
import { documentContextSchema, ragAnswerSchema } from "../schemas/agent-schemas";

// Configuration values (can be overridden via environment variables)
const RERANK_THRESHOLD = parseInt(process.env.RERANK_THRESHOLD || '8'); // Skip reranking if <= this many docs
const MAX_RETRIEVAL_STEPS = parseInt(process.env.MAX_RETRIEVAL_STEPS || '1'); // Max tool call attempts
const TOP_K = parseInt(process.env.RETRIEVAL_TOP_K || '8'); // Number of documents to retrieve

// Step 1: Retrieve and Rerank documents
const retrievalStep = createStep({
  id: 'retrieval-and-rerank',
  description: 'Retrieve all documents and rerank by relevance',
  inputSchema: z.object({
    question: z.string()
  }),
  outputSchema: z.object({
    contexts: z.array(documentContextSchema),
    question: z.string()
  }),
  execute: async ({ inputData, mastra }) => {
    const startTime = Date.now();
    const requestId = `REQ-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

    console.log(`[${requestId}] 🚀 Starting document retrieval for question: "${inputData.question}"`);
    console.log(`[${requestId}] 📊 Config: TOP_K=${TOP_K}, RERANK_THRESHOLD=${RERANK_THRESHOLD}, MAX_STEPS=${MAX_RETRIEVAL_STEPS}`);
    logStepStart('retrieval-and-rerank', { question: inputData.question, requestId });

    try {
      logAgentActivity('retrieve', 'querying-documents', { requestId });

      // Retrieve documents using mastra context
      const agent = mastra?.getAgent('local-retrieve') || localRetrieveAgent;
      console.log(`[${requestId}] 🤖 Calling local retrieve agent...`);

      const retrieveResult = await agent.generate(JSON.stringify({
        question: inputData.question,
        requestId: requestId
      }), {
        toolChoice: 'required',
        maxSteps: MAX_RETRIEVAL_STEPS  // Configurable limit for tool calls
      });

      console.log(`[${requestId}] ✅ Retrieve agent completed`);

      let contexts: any[] = [];

      // Extract from tool results
      if (retrieveResult.toolResults && retrieveResult.toolResults.length > 0) {
        const toolResult = retrieveResult.toolResults.find(tr =>
          tr.toolName === 'localVectorQueryTool' ||
          tr.toolName === 'local-vector-query'
        ) || retrieveResult.toolResults[0];

        if (toolResult && toolResult.result && toolResult.result.contexts) {
          contexts = toolResult.result.contexts;
          console.log(`[${requestId}] 📄 Extracted ${contexts.length} contexts from tool results`);
        }
      }

      // Skip reranking if no contexts or few contexts (8 or less don't need reranking)
      if (!contexts || contexts.length === 0) {
        logStepEnd('retrieval-and-rerank', { contextsFound: 0 }, Date.now() - startTime);
        return {
          contexts: [],
          question: inputData.question
        };
      }

      // Skip reranking if context count is at or below threshold (already sorted by relevance from vector DB)
      if (contexts.length <= RERANK_THRESHOLD) {
        console.log(`[${requestId}] ⏭️ Skipping rerank (${contexts.length} <= ${RERANK_THRESHOLD} threshold)`);
        logStepEnd('retrieval-and-rerank', { contextsFound: contexts.length, skippedRerank: true }, Date.now() - startTime);
        return {
          contexts,
          question: inputData.question
        };
      }

      // Rerank contexts for relevance (only for >8 contexts)
      try {
        const rerankResult = await rerankAgent.generate(JSON.stringify({
          question: inputData.question,
          contexts: contexts
        }), {
          experimental_output: rerankOutputSchema,
          maxSteps: 1
        });

        const rerankResponse = rerankResult.object || { contexts: [] };
        const output = {
          contexts: rerankResponse.contexts || contexts,
          question: inputData.question
        };

        logStepEnd('retrieval-and-rerank', { contextsFound: output.contexts.length }, Date.now() - startTime);
        return output;
      } catch (error) {
        // If reranking fails, return original contexts
        const output = {
          contexts,
          question: inputData.question
        };

        logStepEnd('retrieval-and-rerank', { contextsFound: output.contexts.length, rerankFailed: true }, Date.now() - startTime);
        return output;
      }
    } catch (error) {
      logError('retrieval-and-rerank', error, { question: inputData.question });
      throw new Error(`Document retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
});

// Step 2: Generate answer from contexts
const answerStep = createStep({
  id: 'answer-generation',
  description: 'Generate answer from retrieved contexts',
  inputSchema: z.object({
    contexts: z.array(documentContextSchema),
    question: z.string()
  }),
  outputSchema: z.object({
    answer: ragAnswerSchema,
    contexts: z.array(documentContextSchema),
    question: z.string()
  }),
  execute: async ({ inputData }) => {
    const startTime = Date.now();
    logStepStart('answer-generation', { contextsCount: inputData.contexts.length, question: inputData.question });

    try {
      logAgentActivity('answerer', 'generating-answer', { contextsCount: inputData.contexts.length });

      const result = await answererAgent.generate(JSON.stringify({
        question: inputData.question,
        contexts: inputData.contexts
      }), {
        experimental_output: answererOutputSchema
      });

      const answer = result.object || { answer: "Unable to generate answer", citations: [] };

      // Ensure we always have a proper response for no contexts
      if (inputData.contexts.length === 0 && (!answer.answer || answer.answer.trim() === "")) {
        answer.answer = "No documents found that contain information about this topic.";
        answer.citations = [];
      }

      const output = {
        answer,
        contexts: inputData.contexts,
        question: inputData.question
      };

      logStepEnd('answer-generation', { citationsCount: answer.citations?.length || 0 }, Date.now() - startTime);
      return output;
    } catch (error) {
      logError('answer-generation', error, { contextsCount: inputData.contexts.length });
      throw new Error(`Answer generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
});

// Step 3: Verify answer (simplified for local use)
const verifyStep = createStep({
  id: 'answer-verification',
  description: 'Verify answer quality',
  inputSchema: z.object({
    answer: ragAnswerSchema,
    contexts: z.array(documentContextSchema),
    question: z.string()
  }),
  outputSchema: z.object({
    answer: z.string(),
    citations: z.array(z.object({
      docId: z.string(),
      source: z.string()
    }))
  }),
  execute: async ({ inputData }) => {
    const startTime = Date.now();
    logStepStart('answer-verification', { citationsCount: inputData.answer.citations?.length || 0, question: inputData.question });

    try {
      logAgentActivity('verifier', 'verifying-answer', { citationsCount: inputData.answer.citations?.length || 0 });

      const result = await verifierAgent.generate(JSON.stringify({
        answer: inputData.answer,
        question: inputData.question,
        contexts: inputData.contexts
      }), {
        experimental_output: verifierOutputSchema
      });

      const verification = result.object || { ok: false, reason: "Verification failed" };

      if (!verification.ok) {
        // Handle specific case where answer indicates insufficient evidence
        if (inputData.answer.answer.includes("No documents found") ||
          inputData.answer.answer.includes("don't contain information about this")) {
          const output = {
            answer: inputData.answer.answer,
            citations: inputData.answer.citations || []
          };
          logStepEnd('answer-verification', { verified: true, insufficientEvidence: true, citationsCount: output.citations.length }, Date.now() - startTime);
          return output;
        }

        logError('answer-verification', new Error(verification.reason), { reason: verification.reason });
        throw new Error(verification.reason || 'Answer failed verification');
      }

      const output = {
        answer: inputData.answer.answer,
        citations: inputData.answer.citations || []
      };

      logStepEnd('answer-verification', { verified: true, citationsCount: output.citations.length }, Date.now() - startTime);
      return output;
    } catch (error) {
      logError('answer-verification', error, { question: inputData.question });
      throw new Error(`Answer verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
});

// Create the simplified workflow
export const localRagAnswer = createWorkflow({
  id: "local-rag-answer",
  description: "Local RAG: retrieve+rerank → answer → verify",
  inputSchema: z.object({
    question: z.string()
  }),
  outputSchema: z.object({
    answer: z.string(),
    citations: z.array(z.object({
      docId: z.string(),
      source: z.string()
    }))
  }),
})
  .then(retrievalStep)
  .then(answerStep)
  .then(verifyStep)
  .commit();