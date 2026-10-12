import type { Document, Input, Permutation } from "../index.js";
import { wholeValueTarget } from "../read/ref-meaning.js";
import { refSteps } from "../read/pointer.js";
import { isAlias, isPointer } from "../values/references.js";
import { permutationOf, token } from "./token.js";

/**
 * The token, then each token its whole value refers to in turn, ending at the one that holds a
 * value: `{…}` aliases and `$ref` pointers to a whole value are followed; a reference inside a
 * composite's part is not. Stops at a reference to nothing and at a loop, without repeating. In a
 * permutation as {@link token} takes it; empty when the token isn't there.
 *
 * @example
 * aliasChain(doc, "color.text") // ["color.text", "color.brand.700", "palette.red.700"]
 */
export function aliasChain(doc: Document, path: string, input?: Input): string[];
export function aliasChain(permutation: Permutation, path: string): string[];
export function aliasChain(from: Document | Permutation, path: string, input?: Input): string[] {
    const found = permutationOf(from, input);
    if (!found) return [];
    const chain: string[] = [];
    for (let at = token(found, path); at && !chain.includes(at.path);) {
        chain.push(at.path);
        const next = wholeTarget(at.value);
        at = next === undefined ? undefined : token(found, next);
    }
    return chain;
}

function wholeTarget(value: unknown): string | undefined {
    if (isAlias(value)) return value.alias;
    if (!isPointer(value)) return undefined;
    const steps = refSteps(value.pointer);
    return steps && wholeValueTarget(steps);
}
