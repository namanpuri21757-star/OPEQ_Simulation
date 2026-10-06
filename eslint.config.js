import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'data', 'coverage', 'test-results', 'playwright-report', 'node_modules'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    // Plain Node scripts: no TypeScript, so they need the Node globals declared.
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: globals.nodeBuiltin },
  },
  {
    files: ['src/client/**/*.{ts,tsx}'],
    // configs.flat.* are the flat-config shapes; the top-level ones are eslintrc.
    ...reactHooks.configs.flat['recommended-latest'],
  },
  {
    rules: {
      // Unused args are often part of a signature we must keep; an underscore
      // marks them on purpose.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);
