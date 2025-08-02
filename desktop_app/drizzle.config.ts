import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './src/backend/database/migrations',
  schema: './src/backend/database/schema',
  dialect: 'sqlite',
  dbCredentials: {
    url: `${process.env.HOME}/Library/Application Support/archestra/archestra.db`,
  },
});
