import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import typescriptEslint from 'typescript-eslint';

const eslintConfig = defineConfig([
  ...nextVitals,
  {
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    files: ['scripts/**'],
    plugins: {
      '@typescript-eslint': typescriptEslint.plugin,
    },
    rules: {
      '@typescript-eslint/no-var-requires': 'off',
    },
  },
  globalIgnores([
    '.cache/**',
    '.tmp-*',
    '.tmp-*/**',
    'deploy/**',
    'next-env.d.ts',
    'node_modules/**',
    'out/**',
    'tsconfig.tsbuildinfo',
  ]),
]);

export default eslintConfig;
