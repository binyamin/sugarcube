import type { Permutation, Permutations } from "../index.js";
import { labelFor } from "../lookup/permutation-label.js";

export function permutationsOf(list: Permutation[], all: readonly Permutation[]): Permutations {
    let label: string | undefined | null = null;
    const inputs = () => list.map(({ input }) => input);
    return Object.defineProperties(list, {
        inputs: { get: inputs },
        label: {
            get: () => {
                if (label === null) label = labelFor(list, all);
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
