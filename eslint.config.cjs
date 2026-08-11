const globals = require("globals");

const safetyRules = {
  "no-async-promise-executor": "error",
  "no-eval": "error",
  "no-implied-eval": "error",
  "no-new-func": "error",
  "no-promise-executor-return": "error",
  "no-unsafe-finally": "error",
  "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
  "no-use-before-define": ["error", { functions: false, classes: true, variables: true }],
  "require-await": "error",
  "no-restricted-syntax": [
    "error",
    {
      selector: "AssignmentExpression[left.property.name='innerHTML']",
      message: "Use safe DOM construction or the centralized sanitized HTML boundary."
    },
    {
      selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
      message: "Use safe DOM construction or the centralized sanitized HTML boundary."
    }
  ]
};

module.exports = [
  {
    ignores: ["dist/**", "dist-web/**", ".cache/**", "node_modules/**", "test-artifacts/**"]
  },
  {
    files: ["src/**/*.js", "config/**/*.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: globals.browser
    },
    rules: safetyRules
  },
  {
    files: ["src/security/safe-html.js"],
    rules: {
      "no-restricted-syntax": "off"
    }
  },
  {
    files: [
      "desktop/runtime-settings.cjs",
      "scripts/build-renderer.cjs",
      "scripts/verify-renderer-build.cjs",
      "scripts/verify-electron-fuses.cjs",
      "scripts/verify-import-boundaries.cjs",
      "scripts/verify-accessibility.cjs",
      "tests/unit/**/*.cjs"
    ],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "commonjs",
      globals: globals.node
    },
    rules: safetyRules
  }
];
