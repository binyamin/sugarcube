import type { Document, Permutation, Related, Token } from "../index.js";
import { type OnDocument, type OnPermutation, indexBy, related } from "./related.js";

const dependedOn = indexBy(({ from, to }) => [from, to]);

export interface DependenciesOptions {
    /**
     * Include what it depends on through others, however indirectly. Safe with loops.
     * @default false
     */
    transitive?: boolean;
}

/**
 * The tokens this one refers to, or any of several refer to, in file order, in a permutation you
 * already hold. A pointer into part of a token's value counts as depending on that token. The
 * tokens asked about are never among them, even in a loop. For where in a value each reference is
 * written, use {@link references}.
 *
 * @example
 * dependencies(permutation, "color.danger")                      // color.brand
 * dependencies(permutation, "color.danger", { transitive: true }) // palette.red, color.brand
 * dependencies(permutation, ["button.fill", "button.text"])      // what either refers to
 */
export function dependencies(
    permutation: Permutation,
    path: string | string[],
    options?: DependenciesOptions,
): Token[];
/**
 * The tokens this one refers to, or any of several refer to, in every permutation: each path
 * once, with the permutations it is referred to in, in the order they are first met. For one
 * permutation, give that permutation.
 *
 * @example
 * dependencies(doc, "color.brand")                        // palette.red in light, palette.blue in dark
 * dependencies(doc, "color.danger", { transitive: true }) // however indirectly
 */
export function dependencies(
    doc: Document,
    path: string | string[],
    options?: DependenciesOptions,
): Related[];
export function dependencies(
    ...args: OnPermutation<DependenciesOptions> | OnDocument<DependenciesOptions>
): Token[] | Related[] {
    return related(dependedOn, args);
}
