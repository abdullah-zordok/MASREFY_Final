import type { Config } from 'jest';

const base: Config = {
  rootDir: '.',
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  moduleFileExtensions: ['ts', 'js', 'json'],
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  testEnvironment: 'node',
  clearMocks: true,
  restoreMocks: true,
};

const project = (displayName: string, path: string): Config => ({
  ...base,
  displayName,
  roots: [`<rootDir>/test/${path}`],
  testMatch: ['**/*.spec.ts', '**/*-spec.ts'],
});

export default {
  projects: [
    project('unit', 'unit'),
    project('contract', 'contract'),
    project('integration', 'integration'),
    project('e2e', 'e2e'),
    project('security', 'security'),
    project('container', 'container'),
  ],
} satisfies Config;
