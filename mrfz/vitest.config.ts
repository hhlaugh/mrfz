import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { environment: 'node', include: ['src/**/*.test.ts', 'relay-server/**/*.test.ts'] } });
