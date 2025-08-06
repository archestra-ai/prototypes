import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { Ollama, Message } from 'ollama';
import { generateId } from 'ai';

import { chatService } from '@backend/models/chat';

interface StreamRequestBody {
  model: string;
  messages: Array<any>;
  sessionId?: string;
}

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';

const ollamaLLMRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: StreamRequestBody }>(
    '/api/llm/ollama/stream',
    {
      schema: {
        operationId: 'streamOllamaResponse',
        description: 'Stream Ollama response',
        tags: ['LLM', 'Ollama'],
      },
    },
    async (request: FastifyRequest<{ Body: StreamRequestBody }>, reply: FastifyReply) => {
      const { messages, sessionId, model = 'llama3.1:8b' } = request.body;
      
      fastify.log.info('Ollama stream request:', {
        model,
        sessionId,
        messageCount: messages?.length || 0,
      });

      try {
        // Hijack the response to handle it manually
        reply.hijack();
        
        // Set CORS headers
        reply.raw.setHeader('Access-Control-Allow-Origin', '*');
        reply.raw.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        reply.raw.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        reply.raw.setHeader('Access-Control-Allow-Credentials', 'true');
        
        // Set SSE headers
        reply.raw.setHeader('Content-Type', 'text/event-stream');
        reply.raw.setHeader('Cache-Control', 'no-cache');
        reply.raw.setHeader('Connection', 'keep-alive');
        reply.raw.setHeader('X-Accel-Buffering', 'no');
        
        // Write the status code
        reply.raw.writeHead(200);

        const ollama = new Ollama({ host: OLLAMA_HOST });
        
        // Convert messages to Ollama format
        const ollamaMessages: Message[] = messages.map((msg: any) => ({
          role: msg.role,
          content: msg.content,
        }));

        const messageId = generateId();
        let fullContent = '';
        let isFirstChunk = true;

        // Start streaming
        const response = await ollama.chat({
          model,
          messages: ollamaMessages,
          stream: true,
        });

        // Send start message
        reply.raw.write(`data: {"type":"start"}\n\n`);

        // Process the stream
        for await (const chunk of response) {
          if (chunk.message?.content) {
            // Send text-start on first chunk
            if (isFirstChunk) {
              reply.raw.write(`data: {"type":"text-start","id":"${messageId}"}\n\n`);
              isFirstChunk = false;
            }
            
            fullContent += chunk.message.content;
            
            // Escape the content properly for JSON
            const escapedContent = chunk.message.content
              .replace(/\\/g, '\\\\')
              .replace(/"/g, '\\"')
              .replace(/\n/g, '\\n')
              .replace(/\r/g, '\\r')
              .replace(/\t/g, '\\t');
            
            // Send text delta with id
            reply.raw.write(`data: {"type":"text-delta","id":"${messageId}","delta":"${escapedContent}"}\n\n`);
          }
        }

        // Send text-end if we had any content
        if (!isFirstChunk) {
          reply.raw.write(`data: {"type":"text-end","id":"${messageId}"}\n\n`);
        }

        // Save messages before finishing
        if (sessionId && fullContent) {
          const assistantMessage = {
            id: messageId,
            role: 'assistant',
            content: fullContent,
          };
          const finalMessages = [...messages, assistantMessage];
          await chatService.saveMessages(sessionId, finalMessages);
        }

        // Send finish message
        reply.raw.write(`data: {"type":"finish"}\n\n`);
        
        // End the response
        reply.raw.end();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorStack = error instanceof Error ? error.stack : '';
        
        fastify.log.error('Ollama streaming error:', {
          message: errorMessage,
          stack: errorStack,
          error: error,
        });
        
        // Check if we've already hijacked
        if (!reply.sent) {
          // If not hijacked yet, send normal error response
          return reply.code(500).send({
            error: 'Failed to stream response',
            details: errorMessage,
          });
        } else {
          // If already hijacked, try to send error in SSE format
          try {
            reply.raw.write(`data: {"type":"error","errorText":"${errorMessage}"}\n\n`);
            reply.raw.end();
          } catch (writeError) {
            // If writing fails, just log it
            fastify.log.error('Failed to write error to stream:', writeError);
          }
        }
      }
    }
  );
};

export default ollamaLLMRoutes;