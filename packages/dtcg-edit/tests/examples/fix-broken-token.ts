// Shows a token whose value can't be read, with what's wrong, then fixes it.
import { type DesignTokens } from "@sugarcube-sh/dtcg";
import { setValue, commit } from "@sugarcube-sh/dtcg-edit";

declare let tokens: DesignTokens;

const t = tokens.permutation().token("color.brand");
if (t?.invalid) {
    showBroken(t.authored?.value, t.diagnostics);
    const done = commit(tokens, setValue(tokens, t.path, "#e11d48"));
    if ("tokens" in done) tokens = done.tokens;
}
