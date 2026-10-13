import type { DesignSystem, Permutation, Permutations, Token } from "@sugarcube-sh/dtcg";
import type { Use, Uses } from "./uses.js";

export interface Analysis {
    ds: DesignSystem;
    uses: Uses;
}

export interface Unused {
    unused: string[];
    total: number;
}

export interface Dependent {
    path: string;
    references: string[];
    inDefault?: string;
    label?: string;
}

export interface Impact {
    token: Token;
    dependents: Dependent[];
    uses: Use[];
}

export function unused({ ds, uses }: Analysis): Unused {
    const used = uses.uses.map(({ token }) => token);
    const reached = new Set(used);
    for (const path of used) {
        for (const { path: named } of ds.references(path, { chained: true })) {
            if (named !== undefined) reached.add(named);
        }
    }
    const paths = ds.tokenPaths();
    return { unused: paths.filter((path) => !reached.has(path)).sort(), total: paths.length };
}

export function tokenAt(ds: DesignSystem, path: string): Token | "group" | undefined {
    const inDefault = ds.permutations.find((each) => each.isDefault)?.token(path);
    if (inDefault) return inDefault;
    for (const permutation of ds.permutations) {
        const found = permutation.token(path);
        if (found) return found;
    }
    return ds.has(path) ? "group" : undefined;
}

interface Named {
    path: string;
    permutations: Permutations;
}

export function impact({ ds, uses }: Analysis, token: Token): Impact {
    const byDependent = new Map<string, Named[]>();
    for (const { from, path, permutations } of ds.referencedBy(token.path, { chained: true })) {
        if (from === token.path || path === undefined) continue;
        byDependent.set(from, [...(byDependent.get(from) ?? []), { path, permutations }]);
    }
    const dependents = [...byDependent]
        .map(([path, references]) => dependent(ds, path, references))
        .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    const affected = new Set([token.path, ...byDependent.keys()]);
    return { token, dependents, uses: uses.uses.filter((each) => affected.has(each.token)) };
}

function dependent(ds: DesignSystem, path: string, references: Named[]): Dependent {
    const paths = (named: Named[]) => [...new Set(named.map((each) => each.path))].sort();
    const namedIn = (permutation: Permutation) =>
        paths(references.filter(({ permutations }) => permutations.includes(permutation)));
    const found: Dependent = { path, references: paths(references) };
    const defaultTheme = ds.permutations.find((each) => each.isDefault);
    const [inDefault] = defaultTheme ? namedIn(defaultTheme) : [];
    if (inDefault) found.inDefault = inDefault;
    if (found.references.length < 2) return found;

    const base = defaultTheme ?? ds.permutations[0];
    const before = base && namedIn(base).join("\0");
    const changed = ds.permutations.filter((each) => namedIn(each).join("\0") !== before);
    const setBy = new Set(
        changed.flatMap((each) => {
            const context = each.token(path)?.valueFrom.source.context;
            return context ? [context.modifier.name] : [];
        }),
    );
    if (changed.length === 0) found.label = `${found.references.length} references`;
    else if (setBy.size === 1) found.label = `per ${[...setBy][0]}`;
    else found.label = "per context";
    return found;
}
