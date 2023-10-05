// @ts-check

/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  transform: {
    '.*\\.spec\\.ts': ['ts-jest', {
      tsconfig: 'tsconfig.jest.json',
    }]
  },
};
