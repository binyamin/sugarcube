// Removes a whole group, after first showing which references that would break.
import { type DesignTokens } from "@sugarcube-sh/dtcg";
import { remove, commit } from "@sugarcube-sh/dtcg-edit";

declare let tokens: DesignTokens;

const result = remove(tokens, "color.legacy");
if ("ops" in result && result.broken?.length) {
    showMessage(`Removing color.legacy breaks: ${result.broken.join(", ")}`);
}
const done = commit(tokens, result);
if ("tokens" in done) tokens = done.tokens;
