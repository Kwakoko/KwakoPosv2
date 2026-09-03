module.exports = {
  root: true,
  env: { es2022: true, node: true, browser: true },
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
  ignorePatterns: ["**/*.ts", "**/*.tsx", "**/dist/**", "node_modules/**", "coverage/**"],
  rules: {},
};
