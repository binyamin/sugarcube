import type { Permutation, Permutations, Scope } from "../index.js";
import { scopeLabel, scopeOf } from "../lookup/permutation-label.js";

export function permutationsOf(
    given: readonly Permutation[],
    all: readonly Permutation[],
): Permutations {
    const held = new Set(given);
    const list = all.filter((each) => held.has(each));
    let scope: Scope | undefined;
    let label: string | undefined;
    const inputs = () => list.map(({ input }) => input);
    const scoped = () => {
        scope ??= scopeOf(list, all);
        return scope;
    };
    return Object.defineProperties(list, {
        inputs: { get: inputs },
        scope: { get: scoped },
        label: {
            get: () => {
                label ??= scopeLabel(scoped(), all);
                return label;
            },
        },
        toJSON: { value: inputs },
        where: {
            value: (test: (permutation: Permutation) => boolean) =>
                permutationsOf(list.filter(test), all),
        },
    }) as unknown as Permutations;
}
