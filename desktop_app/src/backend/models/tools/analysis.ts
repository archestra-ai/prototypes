import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { ToolAnalysisResult, ToolAnalysisResultSchema } from '@backend/database/schema/tool';
import { OllamaClient } from '@backend/llms/ollama/client';
import log from '@backend/utils/logger';

export class ToolAnalysis {
  private ollamaClient: OllamaClient;

  constructor() {
    this.ollamaClient = new OllamaClient();
  }

  /**
   * Analyze MCP tools to determine their characteristics
   */
  async analyze(tools: Tool[]): Promise<Record<string, ToolAnalysisResult>> {
    const results: Record<string, ToolAnalysisResult> = {};

    // Process tools in batches to avoid overwhelming the LLM
    const batchSize = 5;
    for (let i = 0; i < tools.length; i += batchSize) {
      const batch = tools.slice(i, i + batchSize);
      const batchResults = await this.analyzeBatch(batch);
      Object.assign(results, batchResults);
    }

    return results;
  }

  /**
   * Analyze a batch of tools
   */
  private async analyzeBatch(tools: Tool[]): Promise<Record<string, ToolAnalysisResult>> {
    const toolDescriptions = tools
      .map((tool) => {
        const annotations = (tool as any).annotations || {};
        return `Tool: ${tool.name}
Description: ${tool.description || 'No description provided'}
Input Schema: ${JSON.stringify(tool.inputSchema || {}, null, 2)}
Annotations: ${JSON.stringify(annotations, null, 2)}`;
      })
      .join('\n\n---\n\n');

    const prompt = `You are analyzing MCP (Model Context Protocol) tools to determine their characteristics.

For each tool, determine the following properties:
- is_read: true if the tool only reads data without making any changes
- is_write: true if the tool can modify, create, or delete data
- idempotent: true if calling the tool multiple times with the same input produces the same result
- reversible: true if the tool's actions can be undone (e.g., creating a file is reversible by deleting it, but sending an email is not)

Consider the tool's name, description, input schema, and any annotations (especially approval_required, resource_intensive, dangerous_interaction annotations).

Here are the tools to analyze:

${toolDescriptions}

Respond with a JSON object where each key is the tool name and the value is an object with the four boolean properties.
Example:
{
  "read_file": {"is_read": true, "is_write": false, "idempotent": true, "reversible": false},
  "send_email": {"is_read": false, "is_write": true, "idempotent": false, "reversible": false}
}

IMPORTANT: Respond with ONLY the JSON object, no explanation or markdown.`;

    try {
      const response = await this.ollamaClient.generate({
        model: 'phi3:3.8b',
        prompt,
        stream: false,
        format: 'json',
        options: {
          temperature: 0.1, // Low temperature for consistent analysis
          num_predict: 1000,
        },
      });

      // Parse the response
      const analysisResults = JSON.parse(response.response);

      // Validate and normalize results
      const results: Record<string, ToolAnalysisResult> = {};
      for (const tool of tools) {
        const toolResult = analysisResults[tool.name];
        if (toolResult) {
          try {
            results[tool.name] = ToolAnalysisResultSchema.parse(toolResult);
          } catch (error) {
            log.error(`Invalid analysis result for tool ${tool.name}:`, error);
            // Provide conservative defaults if parsing fails
            results[tool.name] = {
              is_read: false,
              is_write: true,
              idempotent: false,
              reversible: false,
            };
          }
        } else {
          // Provide conservative defaults if no result
          log.warn(`No analysis result for tool ${tool.name}, using conservative defaults`);
          results[tool.name] = {
            is_read: false,
            is_write: true,
            idempotent: false,
            reversible: false,
          };
        }
      }

      return results;
    } catch (error) {
      log.error('Failed to analyze tools batch:', error);
      // Return conservative defaults for all tools on error
      const results: Record<string, ToolAnalysisResult> = {};
      for (const tool of tools) {
        results[tool.name] = {
          is_read: false,
          is_write: true,
          idempotent: false,
          reversible: false,
        };
      }
      return results;
    }
  }
}
