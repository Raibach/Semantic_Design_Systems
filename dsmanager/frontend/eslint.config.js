import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'
import importPlugin from 'eslint-plugin-import'

export default defineConfig([
  globalIgnores([
    'dist',
    '.vite',
    'storybook-static',
    'coverage',
    'src/imports',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    ignores: [
      '**/*.config.{ts,js,mjs,cjs}',
      'vite.config.ts',
      'vitest.config.ts',
      'tailwind.config.ts',
      'vite-plugin-figma-asset.ts',
    ],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    plugins: {
      import: importPlugin,
    },
    rules: {
      'import/no-default-export': 'off',
      'import/default': 'error',
      'import/named': 'off',
      'import/no-named-as-default': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'off',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      'no-irregular-whitespace': 'off',
      'react-refresh/only-export-components': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'no-empty': 'off',
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    files: ['src/components/PromptWorkspace.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      'react-hooks/exhaustive-deps': 'warn',
      'no-empty': 'warn',
      'import/no-default-export': 'warn',
    },
  },
  {
    files: ['src/components/MyStoryEditor.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'import/no-default-export': 'off',
    },
  },
  {
    files: [
      'src/components/TeacherAdmin.tsx',
      'src/components/PromptDashboardCanvas.tsx',
      'src/components/InteractiveChatInterface.tsx',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      'react-hooks/exhaustive-deps': 'warn',
      'import/no-default-export': 'warn',
      'no-empty': 'warn',
    },
  },
  {
    files: [
      'src/services/componentLifecycleTracker.ts',
      'src/services/networkMonitor.ts',
      'src/services/centralizedLoggingHub.ts',
      'src/services/apiResponseTimeAnalyzer.ts',
      'src/services/crashReporter.ts',
      'src/services/securityEventTracker.ts',
      'src/services/customMetricsCollector.ts',
      'src/services/performanceMonitor.ts',
      'src/services/resourceUsageMonitor.ts',
      'src/services/memoryLeakDetector.ts',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-empty': 'off',
    },
  },
])
