// Deprecates a token with a message pointing at its replacement, then lists deprecated tokens still
// in use.
import { type DesignTokens } from "@sugarcube-sh/dtcg";
import { deprecate, commit } from "@sugarcube-sh/dtcg-edit";

declare let tokens: DesignTokens;

const done = commit(tokens, deprecate(tokens, "color.old", "Use color.new instead"));
if (done.tokens) tokens = done.tokens;

for (const t of tokens.permutation().tokens) {
    if (!t.deprecated) continue;
    const users = new Set<string>();
    for (const reference of tokens.referencedBy(t.path)) users.add(reference.from);
    if (users.size) {
        comment(`${t.path} is deprecated (${t.deprecated}) but used by ${[...users].join(", ")}`);
    }
}
