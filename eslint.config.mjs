import globals from 'globals'
import pluginJs from '@eslint/js'
import tseslint from 'typescript-eslint'

/** @type {import('eslint').Linter.Config[]} */
export default [
  { files: ['**/*.{js,mjs,cjs,ts}'], ignores: ['dist'] },
  {
    languageOptions: { globals: globals.node }
  },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      'no-unused-private-class-members': 'warn',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      'no-undef': 'off',
      'linebreak-style': ['error', 'unix'],
      quotes: ['error', 'single'],
      semi: ['error', 'never'],
      'no-else-return': 'error',
      'comma-spacing': 'error',
      'object-curly-spacing': ['error', 'always'],
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-console': 'off',
      'no-const-assign': 'error',
      'no-constant-condition': 'error',
      'no-empty': 'warn',
      'no-func-assign': 'error',
      'no-inline-comments': 'error',
      'no-lonely-if': 'error',
      'no-multiple-empty-lines': ['error', { max: 1 }],
      'no-trailing-spaces': 'error',
      camelcase: 'error',
      'no-dupe-keys': 'error',
      'no-nested-ternary': 'error',
      'no-param-reassign': 'error',
      'no-self-compare': 'error',
      'no-unneeded-ternary': 'error',
      'comma-dangle': ['error', 'never'],
      'arrow-spacing': 'error',
      'arrow-parens': 'error',
      // 立即执行函数风格
      'wrap-iife': ['error', 'inside'],
      'key-spacing': [
        'error',
        {
          afterColon: true
        }
      ]
    }
  }
]
