import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const browserGlobals = {
  window: 'readonly',
  document: 'readonly',
  localStorage: 'readonly',
  crypto: 'readonly',
  fetch: 'readonly',
  URL: 'readonly',
  TextEncoder: 'readonly',
  Intl: 'readonly',
  performance: 'readonly',
  requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  IntersectionObserver: 'readonly',
  ResizeObserver: 'readonly',
  console: 'readonly',
};

export default tseslint.config(
  {
    // legacy/ keeps the pre-rebuild vanilla scrapbook for reference only.
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'legacy/**', 'public/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: { globals: browserGlobals },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
      // TypeScript already reports undefined identifiers, and it knows the DOM.
      'no-undef': 'off',
    },
  },
);
