import { defineConfig } from "oxlint";

export default defineConfig({
    plugins: ["typescript", "react", "jsx-a11y", "import", "unicorn", "oxc"],
    jsPlugins: ["eslint-plugin-regexp"],
    categories: {
        correctness: "error",
        suspicious: "warn",
        perf: "warn",
    },
    rules: {
        "no-await-in-loop": "off",
        "unicorn/consistent-function-scoping": "off",
        "unicorn/no-array-sort": "off",
        "unicorn/prefer-set-has": "off",
        "import/no-unassigned-import": "off",
        "import/no-named-as-default": "off",
        "react/react-in-jsx-scope": "off",
        "regexp/no-super-linear-backtracking": "error",
        "regexp/no-super-linear-move": "error",
    },
    env: {
        builtin: true,
    },
    overrides: [
        {
            files: ["packages/studio/src/controllers/**", "packages/studio/src/adapters/plain.ts"],
            rules: {
                "no-restricted-imports": [
                    "error",
                    {
                        patterns: [
                            {
                                group: ["@sugarcube-sh/core", "@sugarcube-sh/core/*"],
                                message:
                                    "studio's controllers and the plain adapter work for any build tool: ask the build adapter for what sugarcube writes, never core.",
                            },
                        ],
                    },
                ],
            },
        },
        {
            files: [
                "packages/dtcg/src/{index,node,values}.ts",
                "packages/dtcg-edit/src/{index,node,text}.ts",
            ],
            rules: {
                "no-unused-vars": ["error", { args: "none" }],
            },
        },
    ],
});
