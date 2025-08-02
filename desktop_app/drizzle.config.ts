import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './src/database/migrations',
  schema: './src/database/schema',
  dialect: 'sqlite',
  dbCredentials: {
    url: `${process.env.HOME}/Library/Application Support/archestra/archestra.db`,
  },
});
