module.exports = {
  ignoreFiles: ["dist/**", "dist-web/**", ".cache/**", "node_modules/**", "test-artifacts/**"],
  rules: {
    "color-no-invalid-hex": true,
    "declaration-block-no-duplicate-properties": true,
    "font-family-no-duplicate-names": true,
    "function-calc-no-unspaced-operator": true,
    "keyframe-block-no-duplicate-selectors": true,
    "property-no-unknown": true,
    "selector-pseudo-class-no-unknown": true,
    "selector-pseudo-element-no-unknown": true,
    "unit-no-unknown": true,
    "declaration-property-value-disallowed-list": {
      "/^(?:background|background-color|border(?:-.*)?-color|box-shadow|color|outline(?:-.*)?|text-shadow)$/": [
        "/#[0-9a-f]{3,8}/i",
        "/rgba?\\(/i",
        "/hsla?\\(/i"
      ]
    }
  },
  overrides: [
    {
      files: ["src/ui/tokens.css", "src/ui/themes.css"],
      rules: {
        "declaration-property-value-disallowed-list": null
      }
    }
  ]
};
