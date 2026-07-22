import js from '@eslint/js';
import importPlugin from 'eslint-plugin-import';
import globals from 'globals';

/** Shared browser ES-module lint rules for game source and regression fixtures. */
export const browserModuleLint = {
    languageOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        globals: {
            ...globals.browser,
        },
    },
    settings: {
        'import/resolver': {
            node: {
                extensions: ['.js'],
            },
        },
    },
    rules: {
        'no-undef': 'error',
        'no-unused-vars': [
            'error',
            {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                caughtErrorsIgnorePattern: '^_',
            },
        ],
        'no-use-before-define': [
            'error',
            {
                functions: false,
                classes: true,
                variables: true,
                allowNamedExports: false,
            },
        ],
        'import/no-unresolved': [
            'error',
            {
                commonjs: true,
                ignore: ['\\?worker$', '\\?url$'],
            },
        ],
        'import/named': 'error',
        // TODO(#lint): tighten default export usage once the codebase is cleaned up.
        'import/no-named-as-default-member': 'off',
    },
};

export default [
    {
        ignores: [
            'dist/**',
            'build/**',
            'node_modules/**',
            'test/lint/fixtures/**',
        ],
    },
    js.configs.recommended,
    importPlugin.flatConfigs.recommended,
    {
        files: ['src/**/*.js'],
        ...browserModuleLint,
    },
];
