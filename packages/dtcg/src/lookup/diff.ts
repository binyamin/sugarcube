import type {
    Change,
    DesignSystem,
    Group,
    GroupProperty,
    Move,
    Permutation,
    Token,
    TokenProperty,
    TopLevel,
    TopLevelProperty,
    Written,
} from "../index.js";
import { movedPath } from "../path.js";
import { isReference, movedReference } from "../values/references.js";
import { sameJson, saysTheSame } from "../values/same-value.js";
import { findPermutation } from "./permutation.js";

/**
 * What changed between two reads, and in which permutations: tokens and groups added, removed,
 * renamed, or with different properties. A token is compared by what it says, not what it
 * resolves to, so changing one value is one change, not one for every token pointing at it. The
 * value is compared with {@link sameValue}, the type only where the token writes `$type`, and the
 * other properties exactly. A change that is the same in several permutations, such as a value
 * changed in a file they all read, is one entry listing them all.
 *
 * Tokens a generator made are included, with `generated` set, so a tool can show the change to
 * the extension on its group and fold its tokens under it. Tokens a group takes through `$extends`
 * are included the same way, with `inherited` set.
 *
 * Two reads alone cannot tell a rename from a removal and an addition. Pass the moves the edits
 * made, in the order they were made, and those tokens are listed as `renamed`; references the
 * moves rewrote are not changes, and a reference pointed somewhere else is.
 *
 * Each permutation of `after` is compared with the one its input names in `before`, as
 * {@link DesignSystem.permutation} finds it; a permutation `before` has no match for is left out.
 *
 * @example
 * for (const change of diff(before, after, { moved })) row(change.kind, change.path);
 */
export function diff(
    before: DesignSystem,
    after: DesignSystem,
    options?: { moved?: Move[] },
): Change[] {
    const moved = options?.moved ?? [];
    const changes = new Changes();
    for (const now of after.permutations) {
        const was = findPermutation(before, now.input);
        if ("reason" in was) continue;
        changes.add(topLevelChange(was.root, now));
        for (const pair of matched(was.groups, now.groups, moved)) {
            changes.add(groupChange(pair, now, moved));
        }
        for (const pair of matched(was.tokens, now.tokens, moved)) {
            changes.add(tokenChange(pair, now, moved));
        }
    }
    return changes.list;
}

type Pair<T> =
    | { before: T; after: T }
    | { before: T; after: undefined }
    | { before: undefined; after: T };

function matched<T extends Token | Group>(earlier: T[], later: T[], moved: Move[]): Pair<T>[] {
    const byPath = new Map<string, T>();
    for (const each of earlier) {
        const path = movedPath(each.path, moved);
        if (path !== each.path || !byPath.has(path)) byPath.set(path, each);
    }
    const left = new Set(earlier);
    const pairs = later.map((after): Pair<T> => {
        const before = byPath.get(after.path);
        if (!before) return { before: undefined, after };
        left.delete(before);
        return { before, after };
    });
    return [...pairs, ...[...left].map((before) => ({ before, after: undefined }))];
}

function groupChange(
    { before, after }: Pair<Group>,
    { input }: Permutation,
    moved: Move[],
): Change | undefined {
    if (!before) return { kind: "group-added", path: after.path, in: [input], after };
    if (!after) return { kind: "group-removed", path: before.path, in: [input], before };
    const properties = groupDifferences(before, after, moved);
    const { path } = after;
    if (before.path !== path) {
        return {
            kind: "group-renamed",
            from: before.path,
            path,
            in: [input],
            properties,
            before,
            after,
        };
    }
    if (properties.length === 0) return undefined;
    return { kind: "group-changed", path, in: [input], properties, before, after };
}

function tokenChange(
    { before, after }: Pair<Token>,
    { input }: Permutation,
    moved: Move[],
): Change | undefined {
    if (!before) return { kind: "added", path: after.path, in: [input], after };
    if (!after) return { kind: "removed", path: before.path, in: [input], before };
    const properties = tokenDifferences(movedReferences(before, moved), after);
    const { path } = after;
    if (before.path !== path) {
        return { kind: "renamed", from: before.path, path, in: [input], properties, before, after };
    }
    if (properties.length === 0) return undefined;
    return { kind: "changed", path, in: [input], properties, before, after };
}

function tokenDifferences(before: Token, after: Token): TokenProperty[] {
    const same: Record<TokenProperty, boolean> = {
        value: saysTheSame(before, after),
        type: saidType(before) === saidType(after),
        description: before.description === after.description,
        deprecated: saidDeprecation(before) === saidDeprecation(after),
        extensions: sameJson(before.extensions, after.extensions),
    };
    return differing(same);
}

function groupDifferences(before: Group, after: Group, moved: Move[]): GroupProperty[] {
    return differing({
        ...sameWritten(before.authored ?? {}, after.authored ?? {}),
        extends: (before.extends && movedPath(before.extends.path, moved)) === after.extends?.path,
    });
}

function topLevelChange(before: TopLevel, { input, root: after }: Permutation): Change | undefined {
    const properties = differing(sameWritten(before, after));
    if (properties.length === 0) return undefined;
    return { kind: "top-level-changed", in: [input], properties, before, after };
}

function sameWritten(before: Written, after: Written): Record<TopLevelProperty, boolean> {
    return {
        type: before.type === after.type,
        description: before.description === after.description,
        deprecated: before.deprecated === after.deprecated,
        extensions: sameJson(before.extensions, after.extensions),
    };
}

function differing<P extends string>(same: Record<P, boolean>): P[] {
    return (Object.keys(same) as P[]).filter((property) => !same[property]);
}

function saidType(token: Token): string | undefined {
    return token.authored ? token.authored.type : token.type;
}

function saidDeprecation(token: Token): Token["deprecated"] {
    return token.authored ? token.authored.deprecated : token.deprecated;
}

class Changes {
    readonly list: Change[] = [];
    readonly #byPath = new Map<string, Change[]>();

    add(change: Change | undefined): void {
        if (!change) return;
        const key = `${change.kind} ${change.path ?? ""}`;
        const earlier = this.#byPath.get(key) ?? [];
        const same = earlier.find((each) => sameSides(each, change));
        if (same) {
            same.in.push(...change.in);
            return;
        }
        earlier.push(change);
        this.#byPath.set(key, earlier);
        this.list.push(change);
    }
}

type Sides =
    | { of: "token"; before?: Token; after?: Token }
    | { of: "group"; before?: Group; after?: Group }
    | { of: "top level"; before: TopLevel; after: TopLevel };

function sidesOf(change: Change): Sides {
    switch (change.kind) {
        case "added":
        case "removed":
        case "changed":
        case "renamed":
            return { of: "token", ...change };
        case "group-added":
        case "group-removed":
        case "group-changed":
        case "group-renamed":
            return { of: "group", ...change };
        case "top-level-changed":
            return { of: "top level", ...change };
    }
}

function sameSides(a: Change, b: Change): boolean {
    const x = sidesOf(a);
    const y = sidesOf(b);
    if (x.of === "token" && y.of === "token") {
        return both(x.before, y.before, sameToken) && both(x.after, y.after, sameToken);
    }
    if (x.of === "group" && y.of === "group") {
        return both(x.before, y.before, sameGroup) && both(x.after, y.after, sameGroup);
    }
    if (x.of === "top level" && y.of === "top level") {
        return sameTopLevel(x.before, y.before) && sameTopLevel(x.after, y.after);
    }
    return false;
}

function both<T>(a: T | undefined, b: T | undefined, same: (a: T, b: T) => boolean): boolean {
    return a === undefined || b === undefined ? a === b : same(a, b);
}

function sameToken(a: Token, b: Token): boolean {
    return a.path === b.path && tokenDifferences(a, b).length === 0;
}

function sameGroup(a: Group, b: Group): boolean {
    return a.path === b.path && groupDifferences(a, b, []).length === 0;
}

function sameTopLevel(a: TopLevel, b: TopLevel): boolean {
    return differing(sameWritten(a, b)).length === 0;
}

function movedReferences(before: Token, moved: Move[]): Token {
    if (before.value === undefined) return before;
    return { ...before, value: forwarded(before.value, moved) } as Token;
}

function forwarded(value: unknown, moved: Move[]): unknown {
    if (isReference(value)) return movedReference(value, moved);
    if (Array.isArray(value)) return value.map((each) => forwarded(each, moved));
    if (typeof value === "object" && value !== null) {
        return Object.fromEntries(
            Object.entries(value).map(([key, each]) => [key, forwarded(each, moved)]),
        );
    }
    return value;
}
