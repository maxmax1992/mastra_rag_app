import { Mastra } from "@mastra/core";
import { LibSQLStore } from "@mastra/libsql";
import { QdrantVector } from "@mastra/qdrant";

import { answererAgent } from "./agents/answerer.agent";
import { rerankAgent } from "./agents/rerank.agent";
import { localRetrieveAgent } from "./agents/local-retrieve.agent";
import { verifierAgent } from "./agents/verifier.agent";
import { logger } from "./config/logger";
import { localRagAnswer } from "./workflows/local-rag-answer.workflow";
import { governedRagIndex } from "./workflows/governed-rag-index.workflow";

export const mastra = new Mastra({
  storage: new LibSQLStore({
    url: 'file:../mastra.db',
  }),
  logger,
  agents: {
    'local-retrieve': localRetrieveAgent,
    rerank: rerankAgent,
    answerer: answererAgent,
    verifier: verifierAgent
  },
  workflows: {
    'governed-rag-index': governedRagIndex,
    'local-rag-answer': localRagAnswer
  },
  vectors: {
    qdrant: new QdrantVector({
      url: process.env.QDRANT_URL!,
      apiKey: process.env.QDRANT_API_KEY,
    }),
  },
});