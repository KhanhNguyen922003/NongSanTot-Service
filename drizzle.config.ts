import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './src/core/database/migrations',
  schema: './src/core/database/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
