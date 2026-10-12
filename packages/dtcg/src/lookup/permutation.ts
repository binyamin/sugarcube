import type { CompleteInput, Document, Input, Permutation, ResolverModifier } from "../index.js";
import { findByName } from "../read/permutations.js";

/**
 * The permutation for an input. Modifiers left out take their default, and names match whatever
 * their case, as the resolver spec asks.
 *
 * @returns `undefined` when the input names a modifier or context the resolver does not declare,
 * leaves out a modifier that has no default, or asks for a permutation the read did not build.
 *
 * @example
 * permutation(doc, { theme: "dark" })   // the dark theme, every other modifier at its default
 */
export function permutation(doc: Document, input: Input = {}): Permutation | undefined {
    const complete = completeInput(doc, input);
    if (!complete.ok) return undefined;
    const names = modifiersOf(doc).map(({ name }) => name);
    return doc.permutations.find((each) =>
        names.every((name) => each.input[name] === complete.input[name]),
    );
}

/**
 * The permutation in which every modifier is at its default.
 *
 * @returns `undefined` when a modifier has no default, or the read did not build it.
 */
export function defaultPermutation(doc: Document): Permutation | undefined {
    return permutation(doc);
}

export function chosenPermutation(
    doc: Document,
    input: Input | undefined,
): Permutation | undefined {
    if (input !== undefined) return permutation(doc, input);
    return defaultPermutation(doc) ?? doc.permutations[0];
}

/**
 * An input with every modifier given, defaults filled in, and each name as the resolver writes
 * it, or why there is none. Names match whatever their case, as the resolver spec asks.
 *
 * @example
 * completeInput(doc, { Theme: "DARK" })   // { ok: true, input: { theme: "dark", density: "comfy" } }
 * completeInput(doc, { theme: "sepia" })  // { ok: false, reason: "unknown-context", modifier: "theme", context: "sepia" }
 */
export function completeInput(doc: Document, input: Input): CompleteInput {
    const full: Input = {};
    for (const [key, value] of Object.entries(input)) {
        const found = modifier(doc, key);
        if (!found) return { ok: false, reason: "unknown-modifier", modifier: key };
        const context = findByName(found.contexts, value, ({ name }) => name);
        if (context === undefined) {
            return { ok: false, reason: "unknown-context", modifier: found.name, context: value };
        }
        full[found.name] = context.name;
    }
    for (const { name, default: fallback } of modifiersOf(doc)) {
        const context = full[name] ?? fallback;
        if (context === undefined) return { ok: false, reason: "no-default", modifier: name };
        full[name] = context;
    }
    return { ok: true, input: full };
}

/**
 * A modifier that takes part, by its name, whatever its case, as the resolver spec asks; with its
 * contexts and default, as {@link Resolver} has them.
 *
 * @example
 * modifier(doc, "mode")?.default                       // "light"
 * modifier(doc, "mode")?.contexts.map(({ name }) => name) // ["light", "dark"]
 */
export function modifier(doc: Document, name: string): ResolverModifier | undefined {
    return findByName(modifiersOf(doc), name, (each) => each.name);
}

function modifiersOf(doc: Document): ResolverModifier[] {
    return doc.resolver?.modifiers ?? [];
}
