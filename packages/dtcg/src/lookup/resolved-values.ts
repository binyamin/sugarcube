import type { DesignTokens, Permutation, ResolvedInPermutations, Token } from "../index.js";
import { permutationsOf } from "../read/permutations-of.js";
import { sameValue } from "../values/same-value.js";

export function resolvedValuesIn(tokens: DesignTokens, path: string): ResolvedInPermutations[] {
    const found: { token: Token; permutations: Permutation[] }[] = [];
    for (const permutation of tokens.permutations) {
        const token = permutation.token(path);
        if (!token) continue;
        const known = found.find((each) => resolvesAlike(each.token, token));
        if (known) known.permutations.push(permutation);
        else found.push({ token, permutations: [permutation] });
    }
    return found.map(({ token, permutations }) => ({
        token,
        permutations: permutationsOf(permutations, tokens.permutations),
    }));
}

function resolvesAlike(a: Token, b: Token): boolean {
    if (a.resolved === undefined || b.resolved === undefined) {
        return a.resolved === b.resolved && sameValue(a, b);
    }
    return a.type === b.type && sameValue(a.type, a.resolved, b.resolved);
}
