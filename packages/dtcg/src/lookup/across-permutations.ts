import type { Document, Input, Source, Token } from "../index.js";
import { token } from "./token.js";

/**
 * A token as it is in each permutation that has it, in order, with where its value comes from.
 *
 * @example
 * for (const { label, token, overrides } of acrossPermutations(doc, "color.danger")) {
 *   if (overrides) console.log(label, token.authored?.value, token.source.at.file);
 * }
 */
export function acrossPermutations(
    doc: Document,
    path: string,
): {
    input: Input;
    label: string;
    token: Token;
    /** Whether this permutation's value comes from a context's own file rather than a set. */
    overrides: boolean;
    /** How the value arrived: straight from a set, or through a modifier's context. */
    from: Source["from"];
}[] {
    return doc.permutations.flatMap((permutation) => {
        const found = token(permutation, path);
        if (!found) return [];
        const from = permutation.sources[found.source.index]?.from;
        const overrides = from !== undefined && "modifier" in from;
        const { input, label } = permutation;
        return [{ input, label, token: found, overrides, from }];
    });
}
