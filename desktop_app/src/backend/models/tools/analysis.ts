import { ToolAnalysisResult } from '@backend/database/schema/tool';
import { OllamaClient } from '@backend/ollama/client';
import { McpTools } from '@backend/sandbox/sandboxedMcp';
import log from '@backend/utils/logger';

import { ToolModel } from './index';

export class ToolAnalysis {
  private ollamaClient: OllamaClient;

  constructor() {
    this.ollamaClient = new OllamaClient();
  }

  /**
   * Analyze tools using Ollama and persist results
   */
  async analyze(tools: McpTools, mcpServerId: string): Promise<void> {
    try {
      log.info(`Analyzing ${Object.keys(tools).length} tools for MCP server ${mcpServerId}`);

      // Prepare tools for analysis
      const toolsForAnalysis = Object.entries(tools).map(([name, tool]) => ({
        id: `${mcpServerId}__${name}`,
        name,
        description: tool.description || '',
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
      }));

      // Analyze tools in batches to avoid overwhelming the LLM
      const batchSize = 10;
      for (let i = 0; i < toolsForAnalysis.length; i += batchSize) {
        const batch = toolsForAnalysis.slice(i, i + batchSize);

        try {
          // Get analysis results from Ollama
          const analysisResults = await this.ollamaClient.analyzeTools(batch);

          // Persist results
          for (const toolData of batch) {
            const analysis = analysisResults[toolData.name];
            if (analysis) {
              await ToolModel.upsert({
                id: toolData.id,
                mcp_server_id: mcpServerId,
                name: toolData.name,
                description: toolData.description,
                input_schema: toolData.inputSchema,
                ...analysis,
                analyzed_at: new Date().toISOString(),
              });
            } else {
              log.warn(`No analysis results for tool ${toolData.name}`);
              // Still save the tool, just without analysis results
              await ToolModel.upsert({
                id: toolData.id,
                mcp_server_id: mcpServerId,
                name: toolData.name,
                description: toolData.description,
                input_schema: toolData.inputSchema,
              });
            }
          }
        } catch (error) {
          log.error(`Failed to analyze batch of tools:`, error);
          // Still save the tools without analysis results
          for (const toolData of batch) {
            await ToolModel.upsert({
              id: toolData.id,
              mcp_server_id: mcpServerId,
              name: toolData.name,
              description: toolData.description,
              input_schema: toolData.inputSchema,
            });
          }
        }
      }

      log.info(`Completed analysis of tools for MCP server ${mcpServerId}`);
    } catch (error) {
      log.error(`Failed to analyze tools for MCP server ${mcpServerId}:`, error);
      throw error;
    }
  }

  /**
   * Re-analyze tools that haven't been analyzed yet
   */
  async reanalyzeUnanalyzedTools(mcpServerId: string): Promise<void> {
    try {
      const unanalyzedTools = await ToolModel.getUnanalyzedByMcpServerId(mcpServerId);

      if (unanalyzedTools.length === 0) {
        log.info(`No unanalyzed tools found for MCP server ${mcpServerId}`);
        return;
      }

      log.info(`Re-analyzing ${unanalyzedTools.length} unanalyzed tools for MCP server ${mcpServerId}`);

      // Convert to format expected by analyzeTools
      const toolsForAnalysis = unanalyzedTools.map((tool) => ({
        name: tool.name,
        description: tool.description || '',
        inputSchema: tool.input_schema,
      }));

      // Analyze in batches
      const batchSize = 10;
      for (let i = 0; i < toolsForAnalysis.length; i += batchSize) {
        const batch = toolsForAnalysis.slice(i, i + batchSize);

        try {
          const analysisResults = await this.ollamaClient.analyzeTools(batch);

          // Update tools with analysis results
          for (const tool of unanalyzedTools.slice(i, i + batchSize)) {
            const analysis = analysisResults[tool.name];
            if (analysis) {
              await ToolModel.updateAnalysisResults(tool.id, analysis);
            }
          }
        } catch (error) {
          log.error(`Failed to re-analyze batch of tools:`, error);
        }
      }
    } catch (error) {
      log.error(`Failed to re-analyze unanalyzed tools for MCP server ${mcpServerId}:`, error);
      throw error;
    }
  }
}
