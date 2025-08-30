const config = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/popup.ts', '!src/**/content.ts'],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
};

module.exports = config;