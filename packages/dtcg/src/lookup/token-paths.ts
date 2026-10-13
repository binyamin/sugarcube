import type { Document } from "../index.js";

/**
 * Every token's path in any permutation, each once, in the order the permutations list them: a
 * token only a later permutation has comes after the earlier ones' tokens. For a token's value in a
 * permutation, use {@link token} or {@link acrossPermutations}.
 *
 * @example
 * for (const path of tokenPaths(doc)) row(path, token(doc, path, { theme: "dark" })?.resolved);
 */
export function tokenPaths(doc: Document): string[] {
    const paths = new Set<string>();
    for (const permutation of doc.permutations) {
        for (const { path } of permutation.tokens) paths.add(path);
    }
    return [...paths];
}
