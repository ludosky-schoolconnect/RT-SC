import js from '@eslint/js'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default [
  { ignores: ['dist', 'node_modules'] },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tsPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'NewExpression[callee.name="Date"][arguments.length=0]',
          message: 'Use serverNow() from @/lib/serverTime instead of new Date() — device clock is not authoritative.',
        },
        {
          selector: 'CallExpression[callee.object.name="Date"][callee.property.name="now"]',
          message: 'Use serverNow().getTime() from @/lib/serverTime instead of Date.now() — device clock is not authoritative.',
        },
      ],
    },
  },
  // serverTime.ts is the sole owner of Date.now() — it IS the clock module.
  {
    files: ['src/lib/serverTime.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
]
