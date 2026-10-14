// Applies the safe fixes by itself, and asks a person before applying each of the rest.
import { type DesignTokens } from "@sugarcube-sh/dtcg";
import { commit, fix, fixesFor } from "@sugarcube-sh/dtcg-edit";

declare let tokens: DesignTokens;
declare function confirm(question: string): Promise<boolean>;

const errors = tokens.diagnostics.filter((each) => each.severity === "error");
for (const d of errors) {
    for (const offered of fixesFor(tokens, d)) {
        if (!offered.safe && !(await confirm(`${d.message}: ${offered.title}?`))) continue;
        const done = commit(tokens, fix(tokens, [offered]));
        if (done.tokens) tokens = done.tokens;
    }
}
