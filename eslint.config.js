'use strict'

const js = require('@eslint/js')
const globals = require('globals')

module.exports = [
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: globals.node
        },
        rules: {
            indent: ['error', 4],
            'no-var': 'error',
            'prefer-arrow-callback': 'error',
            'prefer-const': 'error',
            'prefer-template': 'error'
        }
    },
    {
        // The tests are indented with tabs and use function callbacks,
        // mocha needs those to give a test its own timeout
        files: ['test/**/*.js'],
        languageOptions: {
            globals: { ...globals.node, ...globals.mocha }
        },
        rules: {
            indent: ['error', 'tab'],
            'prefer-arrow-callback': 'off'
        }
    }
]
