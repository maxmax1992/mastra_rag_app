import { mastra } from '@/src/mastra';

import { NextRequest, NextResponse } from 'next/server';

// Configure timeout config
const STATUS_VALUE = 400;
export const maxDuration = 60; // 60 seconds for chat responses
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { question, conversationHistory } = await request.json();

    if (!question) {
      return NextResponse.json(
        { error: 'Missing question' },
        { status: STATUS_VALUE }
      );
    }

    const encoder: TextEncoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ content: '' })}\n\n`)
          );

          console.log(`Processing message: ${question}`);
          const startTime = Date.now();

          // Use the conversation workflow instead of direct RAG
          const workflow = mastra.getWorkflows()['conversation'];
          const run = await workflow.createRunAsync();

          const result = await run.start({
            inputData: {
              message: question,
              conversationHistory: conversationHistory || []
            }
          });

          const duration: number = (Date.now() - startTime) / 1000;
          console.log(`Workflow completed in ${duration}s`);

          if (result.status === 'success') {
            const { response, citations, usedKnowledgeBase } = result.result;

            // Stream the response in chunks
            const chunks = response.match(/.{1,50}/g) || [response];
            for (const chunk of chunks) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ content: chunk })}\n\n`)
              );
              await new Promise(resolve => setTimeout(resolve, 50));
            }

            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({
                done: true,
                citations: citations || [],
                contexts: [],
                usedKnowledgeBase
              })}\n\n`)
            );
          } else {
            const errorMessage = result.status === 'failed' && 'error' in result
              ? result.error?.message || 'Failed to process your request'
              : 'Failed to process your request';
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({
                content: `⚠️ ${errorMessage}`,
                done: true
              })}\n\n`)
            );
          }
        } catch (error) {
          console.error('Stream error:', error);
          const errorMessage = error instanceof Error ? error.message : 'An error occurred';
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({
              content: `❌ Error: ${errorMessage}`,
              done: true
            })}\n\n`)
          );
        } finally {
          controller.close();
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}