import type { Input } from "../index.js";

/**
 * The label of the permutation an input picks: each modifier and its context, in the order the
 * input lists them. An input the read gives, a permutation's or a problem's, lists them in the
 * order the resolver declares them, so this is that permutation's {@link Permutation.label}.
 *
 * @example
 * permutationLabel({ mode: "dark", density: "comfy" }) // "mode: dark, density: comfy"
 * for (const input of diagnostic.permutations ?? []) console.log(permutationLabel(input));
 */
export function permutationLabel(input: Input): string {
    return Object.entries(input)
        .map(([modifier, context]) => `${modifier}: ${context}`)
        .join(", ");
}
