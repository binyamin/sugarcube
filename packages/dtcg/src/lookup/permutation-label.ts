import type { Input, Permutation } from "../index.js";

/**
 * The label of the permutation an input picks: each modifier and its context, in the order the
 * input lists them. An input the read gives, a permutation's or a problem's, lists them in the
 * order the resolver declares them, so this is that permutation's {@link Permutation.label}.
 *
 * @example
 * permutationLabel({ mode: "dark", density: "comfy" }) // "mode: dark, density: comfy"
 */
export function permutationLabel(input: Input): string {
    return Object.entries(input)
        .map(([modifier, context]) => `${modifier}: ${context}`)
        .join(", ");
}

export function labelFor(
    set: readonly Permutation[],
    all: readonly Permutation[],
): string | undefined {
    if (set.length === all.length) return undefined;
    const [first] = set;
    if (!first) return "";
    const kept = first.contexts.map((_, index) => new Set(set.map((each) => each.contexts[index])));
    const narrowed = kept.map(() => true);
    const matching = () =>
        all.filter((each) =>
            each.contexts.every((context, index) => !narrowed[index] || kept[index]?.has(context)),
        ).length;
    if (matching() !== set.length) return set.map(({ label }) => label).join("; ");
    for (const index of narrowed.keys()) {
        narrowed[index] = false;
        if (matching() !== set.length) narrowed[index] = true;
    }
    return first.contexts
        .flatMap(({ modifier }, index) => {
            if (!narrowed[index]) return [];
            const names = modifier.contexts.filter((each) => kept[index]?.has(each));
            return [`${modifier.name}: ${names.map(({ name }) => name).join(", ")}`];
        })
        .join(", ");
}
