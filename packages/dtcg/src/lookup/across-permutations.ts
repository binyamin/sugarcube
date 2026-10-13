import type { Document, Permutation, Source, Token } from "../index.js";
import { token } from "./token.js";

/**
 * A token in each permutation that has it, in order, with the permutation and where its value comes
 * from: straight from a set, or through a modifier's context. For a token in one permutation, use
 * {@link token}.
 *
 * @example
 * for (const { permutation, token, from } of acrossPermutations(doc, "color.danger")) {
 *   if (from && "modifier" in from) row(permutation.label, token.authored?.value, token.source.at.file);
 * }
 */
export function acrossPermutations(
    doc: Document,
    path: string,
): { permutation: Permutation; token: Token; from: Source["from"] }[] {
    return doc.permutations.flatMap((permutation) => {
        const found = token(permutation, path);
        if (!found) return [];
        return [{ permutation, token: found, from: permutation.sources[found.source.index]?.from }];
    });
}
