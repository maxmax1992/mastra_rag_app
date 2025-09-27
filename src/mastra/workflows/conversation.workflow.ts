import { createWorkflow, createStep } from "@mastra/core";
import { z } from "zod";
import { conversationAgent } from "../agents/conversation.agent";
import { logStepStart, logStepEnd, logError } from "../config/logger";

// Step: Process conversation
const conversationStep = createStep({
  id: 'process-conversation',
  description: 'Process user message and generate appropriate response',
  inputSchema: z.object({
    message: z.string(),
    conversationHistory: z.array(z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string()
    })).optional()
  }),
  outputSchema: z.object({
    response: z.string(),
    citations: z.array(z.object({
      docId: z.string(),
      source: z.string()
    })).optional(),
    usedKnowledgeBase: z.boolean()
  }),
  execute: async ({ inputData }) => {
    const startTime = Date.now();
    const requestId = `CONV-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    logStepStart('process-conversation', {
      message: inputData.message,
      requestId,
      historyLength: inputData.conversationHistory?.length || 0
    });

    try {
      // Build conversation context
      let conversationContext = "";
      if (inputData.conversationHistory && inputData.conversationHistory.length > 0) {
        conversationContext = "Previous conversation:\n";
        inputData.conversationHistory.forEach(msg => {
          conversationContext += `${msg.role}: ${msg.content}\n`;
        });
        conversationContext += "\n";
      }

      // Add current message
      const fullContext = conversationContext + `User: ${inputData.message}`;

      console.log(`[${requestId}] 🤖 Calling conversation agent...`);

      // Call the conversation agent
      const result = await conversationAgent.generate(fullContext, {
        maxSteps: 3, // Allow multiple tool calls if needed
      });

      // Extract response from the agent
      let response = "";
      let citations: any[] = [];
      let usedKnowledgeBase = false;

      // Check if the agent used the RAG tool
      if (result.toolResults && result.toolResults.length > 0) {
        const ragResult = result.toolResults.find(tr =>
          tr.toolName === 'ragQueryTool' || tr.toolName === 'rag-query'
        );

        if (ragResult && ragResult.result) {
          usedKnowledgeBase = true;
          if (ragResult.result.hasAnswer) {
            // Use the RAG answer as the base response
            response = ragResult.result.answer;
            citations = ragResult.result.citations || [];
          }
        }
      }

      // If no tool was used or tool didn't have answer, use the agent's text response
      if (!response && result.text) {
        response = result.text;
      }

      // Fallback if still no response
      if (!response) {
        response = "I'm here to help! Could you please rephrase your question?";
      }

      const output = {
        response,
        citations: citations.length > 0 ? citations : undefined,
        usedKnowledgeBase
      };

      logStepEnd('process-conversation', {
        usedKnowledgeBase,
        citationsCount: citations.length,
        responseLength: response.length
      }, Date.now() - startTime);

      return output;
    } catch (error) {
      logError('process-conversation', error, { message: inputData.message });

      // Return a friendly error message
      return {
        response: "I apologize, but I encountered an issue while processing your request. Please try again.",
        citations: undefined,
        usedKnowledgeBase: false
      };
    }
  }
});

// Create the conversation workflow
export const conversationWorkflow = createWorkflow({
  id: "conversation",
  description: "Handle conversational interactions with optional RAG lookups",
  inputSchema: z.object({
    message: z.string(),
    conversationHistory: z.array(z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string()
    })).optional()
  }),
  outputSchema: z.object({
    response: z.string(),
    citations: z.array(z.object({
      docId: z.string(),
      source: z.string()
    })).optional(),
    usedKnowledgeBase: z.boolean()
  })
})
  .then(conversationStep)
  .commit();