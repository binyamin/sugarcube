// Adds a tool's own advice to a problem. The package says what's wrong, and the tool adds how to
// fix it in that tool's config, naming the entry from the input's position.
import type { DesignTokens } from "@sugarcube-sh/dtcg";

declare const tokens: DesignTokens;

for (const d of tokens.diagnostics) {
    if (d.kind === "input-invalid" && d.detail.reason === "missing-modifier") {
        showMessage(
            `${d.message}\n  Add "${d.detail.modifier}" to \`permutations[${d.detail.input}]\` in sugarcube.config.ts.`,
        );
    }
}
