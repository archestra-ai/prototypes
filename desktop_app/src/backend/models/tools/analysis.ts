import { Tool } from '@modelcontextprotocol/sdk/types.js';

import { OllamaClient } from '@backend/llms/ollama';
import log from '@backend/utils/logger';

import { ToolAnalysisResult, ToolAnalysisResultSchema } from './index';

interface ToolWithAnnotations extends Tool {
  annotations?: {
    read?: boolean;
    write?: boolean;
    idempotent?: boolean;
    reversible?: boolean;
  };
}

class ToolAnalysis {
  /**
   * Analyze tools to determine their characteristics
   */
  async analyze(tools: Record<string, Tool>): Promise<Record<string, ToolAnalysisResult>> {
    const results: Record<string, ToolAnalysisResult> = {};

    // Process tools in batches to avoid overwhelming the LLM
    const toolEntries = Object.entries(tools);
    const batchSize = 5;

    for (let i = 0; i < toolEntries.length; i += batchSize) {
      const batch = toolEntries.slice(i, i + batchSize);
      const batchResults = await this.analyzeBatch(batch);
      Object.assign(results, batchResults);
    }

    return results;
  }

  /**
   * Analyze a batch of tools
   */
  private async analyzeBatch(toolBatch: [string, Tool][]): Promise<Record<string, ToolAnalysisResult>> {
    const results: Record<string, ToolAnalysisResult> = {};

    // Prepare the prompt for the LLM
    const toolDescriptions = toolBatch
      .map(([id, tool]) => {
        const toolWithAnnotations = tool as ToolWithAnnotations;

        // Check if annotations already exist
        if (toolWithAnnotations.annotations) {
          const ann = toolWithAnnotations.annotations;
          results[id] = {
            is_read: ann.read ?? false,
            is_write: ann.write ?? false,
            idempotent: ann.idempotent ?? true,
            reversible: ann.reversible ?? false,
          };
          return null;
        }

        return {
          id,
          name: tool.name,
          description: tool.description || 'No description provided',
          inputSchema: tool.inputSchema ? JSON.stringify(tool.inputSchema) : 'No schema',
        };
      })
      .filter(Boolean);

    // If all tools had annotations, return early
    if (toolDescriptions.length === 0) {
      return results;
    }

    const prompt = `Analyze the following MCP tools and determine their characteristics. For each tool, determine:
- is_read: true if the tool only reads data without modifying anything
- is_write: true if the tool modifies data or state in any way
- idempotent: true if calling the tool multiple times with the same input produces the same result
- reversible: true if the tool's actions can be undone (e.g., delete can't be reversed, but update can be)

Consider the tool name, description, and input schema when making your determination.

Tools to analyze:
${JSON.stringify(toolDescriptions, null, 2)}

Respond with ONLY valid JSON in this exact format:
{
  "<tool_id>": {
    "is_read": boolean,
    "is_write": boolean,
    "idempotent": boolean,
    "reversible": boolean
  }
}`;

    try {
      const response = await OllamaClient.chat(
        [
          {
            role: 'system',
            content:
              'You are a tool analyzer that determines the characteristics of MCP tools. Always respond with valid JSON.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        'phi3:3.8b', // Use the classification model
        'json'
      );

      // Parse the response
      const analysisResults = JSON.parse(response);

      // Validate and store results
      for (const [toolId, analysis] of Object.entries(analysisResults)) {
        try {
          const validatedResult = ToolAnalysisResultSchema.parse(analysis);
          results[toolId] = validatedResult;
        } catch (error) {
          log.error(`Failed to validate analysis for tool ${toolId}:`, error);
          // Provide default values if validation fails
          results[toolId] = {
            is_read: true,
            is_write: false,
            idempotent: true,
            reversible: false,
          };
        }
      }
    } catch (error) {
      log.error('Failed to analyze tools:', error);

      // Provide default values for all tools on error
      for (const [id] of toolBatch) {
        if (!results[id]) {
          results[id] = {
            is_read: true,
            is_write: false,
            idempotent: true,
            reversible: false,
          };
        }
      }
    }

    return results;
  }
}

export default new ToolAnalysis();
