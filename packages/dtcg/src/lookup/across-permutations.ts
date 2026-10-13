import type { Document, Permutation, Token } from "../index.js";
import { token } from "./token.js";

/**
 * A token in each permutation that has it, in order, with the permutation. Where its value comes
 * from is its {@link TokenBase.writtenAt | writtenAt}. For a token in one permutation, use
 * {@link token}.
 *
 * @example
 * for (const { permutation, token } of acrossPermutations(doc, "color.danger")) {
 *   const winner = token.writtenAt.at(-1);
 *   if (winner?.source.context) row(permutation.label, token.authored?.value, winner.span.file);
 * }
 */
export function acrossPermutations(
    doc: Document,
    path: string,
): { permutation: Permutation; token: Token }[] {
    return doc.permutations.flatMap((permutation) => {
        const found = token(permutation, path);
        return found ? [{ permutation, token: found }] : [];
    });
}
