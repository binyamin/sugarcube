// Prints a tree of everything a token depends on, all the way down.
import { defaultPermutation, token, type Document, type Token } from "@sugarcube-sh/dtcg";

declare const doc: Document;

function tree(at: Token, depth = 0): void {
    row(`${"  ".repeat(depth)}${at.path}`);
    for (const { token: next } of at.references) if (next) tree(next, depth + 1);
}

const base = defaultPermutation(doc);
const start = base && token(base, "button.primary.background");
if (start) tree(start);
