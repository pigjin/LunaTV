import js from "@eslint/js";
import next from "eslint-config-next";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import prettier from "eslint-config-prettier/flat";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import tseslint from "typescript-eslint";
import unusedImports from "eslint-plugin-unused-imports";

const eslintConfig = [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...next,
  ...nextCoreWebVitals,
  prettier,
  {
    plugins: {
      "simple-import-sort": simpleImportSort,
      "unused-imports": unusedImports,
    },
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
