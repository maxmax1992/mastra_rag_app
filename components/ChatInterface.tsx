'use client';

import { Send, Loader2 } from 'lucide-react';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import UserMessage from './messages/UserMessage';
import AssistantMessage from './messages/AssistantMessage';
import SystemMessage from './messages/SystemMessage';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  citations?: Array<{ docId: string; source?: string }>;
  contexts?: Array<{
    docId: string;
    classification: string;
    score: number;
  }>;
  timestamp: Date;
}

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    setMessages([{
      id: '0',
      role: 'system',
      content: `Welcome! You have full access to all documents. Ask me anything and I'll retrieve information from the knowledge base.`,
      timestamp: new Date()
    }]);
  }, []);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setLoading(true);

    try {
      // Build conversation history (exclude system messages)
      const conversationHistory = updatedMessages
        .filter(msg => msg.role !== 'system')
        .map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content
        }));

      const response: Response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: input,
          conversationHistory
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const reader = response.body?.getReader();
      const decoder: TextDecoder = new TextDecoder();
      let assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk: string = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                
                if (data.content) {
                  assistantMessage.content += data.content;
                  setMessages(prev => prev.map(msg => 
                    msg.id === assistantMessage.id 
                      ? { ...msg, content: assistantMessage.content }
                      : msg
                  ));
                }

                if (data.citations) {
                  assistantMessage.citations = data.citations;
                }

                if (data.contexts) {
                  assistantMessage.contexts = data.contexts;
                }

                if (data.done) {
                  setMessages(prev => prev.map(msg => 
                    msg.id === assistantMessage.id 
                      ? assistantMessage
                      : msg
                  ));
                }
              } catch (e) {
                console.error('Failed to parse SSE data:', e);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'system',
        content: 'Failed to get response. Please try again.',
        timestamp: new Date()
      }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading]);

  const sampleQuestions: string[] = useMemo(() => [
    "What is the expense reimbursement policy?",
    "What are the API response time requirements?",
    "What is the CEO's compensation?",
    "What is our git workflow?",
    "What are the budget approval thresholds?"
  ], []);

  return (
    <div className="glass-effect rounded-xl overflow-hidden flex flex-col h-[600px]">
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((message: Message) => {
          switch (message.role) {
            case 'user':
              return (
                <UserMessage
                  key={message.id}
                  content={message.content}
                  timestamp={message.timestamp}
                />
              );
            case 'assistant':
              return (
                <AssistantMessage
                  key={message.id}
                  content={message.content}
                  citations={message.citations}
                  contexts={message.contexts}
                  timestamp={message.timestamp}
                />
              );
            case 'system':
              return (
                <SystemMessage
                  key={message.id}
                  content={message.content}
                  timestamp={message.timestamp}
                />
              );
            default:
              return null;
          }
        })}
        
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
              <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {messages.length === 1 && (
        <div className="px-6 pb-4">
          <p className="text-sm text-gray-400 mb-3">Try asking:</p>
          <div className="flex flex-wrap gap-2">
            {sampleQuestions.map((question: string, idx: number) => (
              <button
                key={idx}
                onClick={() => setInput(question)}
                className="text-xs px-3 py-1.5 rounded-full bg-gray-800 hover:bg-gray-700 
                         border border-gray-700 hover:border-gray-600 transition-colors"
              >
                {question}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-gray-800 p-4">
        <div className="flex space-x-3">
          <input
            type="text"
            value={input}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && sendMessage()}
            placeholder="Ask a question..."
            className="flex-1 bg-gray-800/50 border border-gray-700 rounded-lg px-4 py-3
                     focus:outline-none focus:border-blue-500 transition-colors"
            disabled={loading}
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg
                     hover:from-blue-600 hover:to-purple-700 transition-all disabled:opacity-50
                     disabled:cursor-not-allowed flex items-center"
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}