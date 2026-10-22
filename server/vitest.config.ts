import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret-at-least-16-chars',
      // The API tests below never reach the database (auth/validation reject first),
      // but Prisma needs a syntactically valid URL to construct its client.
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://user:pass@localhost:5432/test',
      // Force fallback mode so tests never call the real API.
      ANTHROPIC_API_KEY: '',
    },
  },
});
