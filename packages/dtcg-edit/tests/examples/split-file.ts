// Moves the semantic colors out of `colors.json` into a new `semantic.json`. Their names don't
// change.
import { type DesignTokens } from "@sugarcube-sh/dtcg";
import { addFile, move, commit } from "@sugarcube-sh/dtcg-edit";

declare let tokens: DesignTokens;

let done = commit(
    tokens,
    addFile(tokens, "semantic.json", { to: { set: "base" }, after: "colors.json" }),
);
if ("tokens" in done) tokens = done.tokens;

for (const path of ["color.danger", "color.success", "color.warning"]) {
    done = commit(tokens, move(tokens, path, { file: "semantic.json" }));
    if ("tokens" in done) tokens = done.tokens;
    else if ("refused" in done) showMessage(done.refused.reason);
}
