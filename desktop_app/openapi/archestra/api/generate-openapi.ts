import autoLoad from '@fastify/autoload';
import fastifySwagger from '@fastify/swagger';
import fastify from 'fastify';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

async function generateOpenAPISpec() {
  const app = fastify({ logger: false });

  /**
   * @fastify/swagger MUST be loaded before routes are loaded with @fastify/autoload
   *
   * https://github.com/fastify/fastify-swagger?tab=readme-ov-file#with-fastifyautoload
   */
  await app.register(fastifySwagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'Archestra API',
        version: '0.0.1', // x-release-please-version
      },
    },
  });

  /**
   * Autoload fastify plugins
   *
   * https://github.com/fastify/fastify-autoload
   */
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  app.register(autoLoad, {
    dir: path.join(__dirname, '../../../src/backend/server/plugins'),
    ignorePattern: /ollama/, // Skip Ollama proxy routes for OpenAPI generation
  });

  // Wait for the app to be ready
  await app.ready();

  // Generate the OpenAPI spec
  const spec = app.swagger();

  // Write to file
  const outputPath = path.join(__dirname, 'openapi.json');
  writeFileSync(outputPath, JSON.stringify(spec, null, 2));

  console.log(`OpenAPI spec written to: ${outputPath}`);

  // Close the app
  await app.close();
}

generateOpenAPISpec().catch(console.error);
