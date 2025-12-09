import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";
import tseslint from "typescript-eslint";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
});

const eslintConfig = [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...compat.extends(
    "next",
    "next/core-web-vitals",
    "prettier"
  ),
  ...compat.plugins("simple-import-sort", "unused-imports"),
  {
    rules: {
      "no-unused-vars": "off",
      "no-console": "warn",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "react/no-unescaped-entities": "off",
      "react/display-name": "off",
      "react/jsx-curly-brace-presence": [
        "warn",
        { props: "never", children: "never" },
      ],
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "warn",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
      "simple-import-sort/exports": "warn",
      "simple-import-sort/imports": [
        "warn",
        {
          groups: [
            // ext library & side effect imports
            ["^@?\\w", "^\\u0000"],
            // {s}css files
            ["^.+\\.s?css$"],
            // Lib and hooks
            ["^@/lib", "^@/hooks"],
            // static data
            ["^@/data"],
            // components
            ["^@/components", "^@/container"],
            // zustand store
            ["^@/store"],
            // Other imports
            ["^@/"],
            // relative paths up until 3 level
            [
              "^\\./?$",
              "^\\.(?!/?$)",
              "^\\.\\./?$",
              "^\\.\\.(?!/?$)",
              "^\\.\\./\\.\\./?$",
              "^\\.\\./\\.\\.(?!/?$)",
              "^\\.\\./\\.\\./\\.\\./?$",
              "^\\.\\./\\.\\./\\.\\.(?!/?$)",
            ],
            ["^@/types"],
            // other that didnt fit in
            ["^"],
          ],
        },
      ],
    },
    languageOptions: {
        globals: {
            React: true,
            JSX: true,
        },
    },
  },
];

export default eslintConfig;
