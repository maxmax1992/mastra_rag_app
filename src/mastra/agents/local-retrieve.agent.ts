import { Agent } from "@mastra/core";
import { z } from "zod";

import { openAIModel } from "../config/openai";
import { documentContextSchema } from "../schemas/agent-schemas";
import { localVectorQueryTool } from "../tools/local-vector-query.tool";

export const localRetrieveAgent = new Agent({
  id: "local-retrieve",
  name: "local-retrieve",
  model: openAIModel,
  instructions: `You are a document retrieval agent. Your ONLY job is to call the localVectorQueryTool ONCE.

INPUT: You receive JSON with a 'question' field.
ACTION: Call localVectorQueryTool with that question.
OUTPUT: Return exactly what the tool returns in this format: {"contexts": [...]}

CRITICAL:
- ONE tool call only - do NOT retry or call multiple times
- Do NOT add any text or explanation
- Do NOT modify the tool's response
- Just call the tool ONCE and return its output`,
  tools: { localVectorQueryTool }
});

export const localRetrieveOutputSchema = z.object({
  contexts: z.array(documentContextSchema)
});