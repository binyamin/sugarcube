// Prints a tree of everything a token depends on, all the way down.
import { type DesignTokens, type Token } from "@sugarcube-sh/dtcg";

declare const tokens: DesignTokens;

function tree(at: Token, depth = 0): void {
    row(`${"  ".repeat(depth)}${at.path}`);
    for (const { token: next } of at.references) if (next) tree(next, depth + 1);
}

const base = tokens.permutation();
const start = base.token("button.primary.background");
if (start) tree(start);
