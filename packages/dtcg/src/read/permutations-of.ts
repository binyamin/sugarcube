import type { Permutation, Permutations, Scope } from "../index.js";
import { scopeLabel, scopeOf } from "../lookup/permutation-label.js";

interface Worded {
    scope: Scope;
    label?: string;
}

const wordedIn = new WeakMap<readonly Permutation[], Map<string, Worded>>();

function wordedFor(
    held: ReadonlySet<Permutation>,
    list: readonly Permutation[],
    all: readonly Permutation[],
): Worded {
    let known = wordedIn.get(all);
    if (!known) {
        known = new Map();
        wordedIn.set(all, known);
    }
    const key = all.map((each) => (held.has(each) ? "1" : "0")).join("");
    let worded = known.get(key);
    if (!worded) {
        worded = { scope: scopeOf(list, all) };
        known.set(key, worded);
    }
    return worded;
}

export function permutationsOf(
    given: readonly Permutation[],
    all: readonly Permutation[],
): Permutations {
    const held = new Set(given);
    const list = all.filter((each) => held.has(each));
    const inputs = () => list.map(({ input }) => input);
    const permutations = Object.defineProperties(list, {
        inputs: { get: inputs },
        scope: { get: () => wordedFor(held, list, all).scope },
        label: {
            get: () => {
                const worded = wordedFor(held, list, all);
                worded.label ??= scopeLabel(worded.scope, all);
                return worded.label;
            },
        },
        toJSON: { value: inputs },
        where: {
            value: (test: (permutation: Permutation) => boolean) => {
                const kept = list.filter(test);
                return kept.length === list.length ? permutations : permutationsOf(kept, all);
            },
        },
    }) as unknown as Permutations;
    return permutations;
}
