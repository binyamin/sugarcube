// A cleanup script that removes every token nothing references, in any theme.
import { type DesignTokens } from "@sugarcube-sh/dtcg";
import { remove, commit } from "@sugarcube-sh/dtcg-edit";

declare let tokens: DesignTokens;

const unused = tokens.tokenPaths().filter((path) => tokens.referencedBy(path).length === 0);
for (const path of unused) {
    const done = commit(tokens, remove(tokens, path));
    if ("tokens" in done) tokens = done.tokens;
}
