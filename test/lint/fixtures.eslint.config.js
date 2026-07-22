import js from '@eslint/js';
import importPlugin from 'eslint-plugin-import';
import { browserModuleLint } from '../../eslint.config.js';

export default [
    js.configs.recommended,
    importPlugin.flatConfigs.recommended,
    {
        files: ['test/lint/fixtures/**/*.js'],
        ...browserModuleLint,
    },
];
