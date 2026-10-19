// Shows a token whose value can't be read, with what's wrong, then fixes it.
import { type DesignTokens } from "@sugarcube-sh/dtcg";
import { setValue, commit } from "@sugarcube-sh/dtcg-edit";

declare let tokens: DesignTokens;

const permutation = tokens.permutation();
const t = permutation.token("color.brand");
if (t?.invalid) {
    showBroken(t.authored?.value, permutation.diagnosticsFor(t.path));
    const done = commit(tokens, setValue(tokens, t.path, "#e11d48"));
    if (done.tokens) tokens = done.tokens;
}
