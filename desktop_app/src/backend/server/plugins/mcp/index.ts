import { FastifyPluginAsync } from 'fastify';
import { streamableHttp } from 'fastify-mcp';

import { createArchestraMcpServer } from '@backend/mcpServer';

const archestraMcpServerPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(streamableHttp, {
    stateful: false,
    mcpEndpoint: '/mcp',
    createServer: createArchestraMcpServer,
  });

  fastify.log.info(`Archestra MCP server plugin registered`);
};

export default archestraMcpServerPlugin;
