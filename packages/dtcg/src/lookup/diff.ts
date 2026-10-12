import type {
    Change,
    Document,
    Group,
    GroupProperty,
    Move,
    Permutation,
    Token,
    TokenProperty,
} from "../index.js";
import { movedPath } from "../path.js";
import { encodePointer, refSteps } from "../read/pointer.js";
import { pointerParts } from "../read/ref-meaning.js";
import { isAlias, isPointer } from "../values/references.js";
import { sameJson, saysTheSame } from "../values/same-value.js";
import { permutation } from "./permutation.js";

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
 * {@link permutation} finds it; a permutation `before` has no match for is left out.
 *
 * @example
 * for (const change of diff(before, after, { moved })) row(change.kind, change.path);
 */
export function diff(before: Document, after: Document, options?: { moved?: Move[] }): Change[] {
    const moved = options?.moved ?? [];
    const forward: Forward = (path) => movedPath(path, moved);
    const changes = new Changes();
    for (const now of after.permutations) {
        const was = permutation(before, now.input);
        if (!was) continue;
        for (const pair of matched(was.groups, now.groups, forward)) {
            changes.add(groupChange(pair, now, forward));
        }
        for (const pair of matched(was.tokens, now.tokens, forward)) {
            changes.add(tokenChange(pair, now, forward));
        }
    }
    return changes.list;
}

type Pair<T> =
    | { before: T; after: T }
    | { before: T; after: undefined }
    | { before: undefined; after: T };

function matched<T extends Token | Group>(earlier: T[], later: T[], forward: Forward): Pair<T>[] {
    const byPath = new Map<string, T>();
    for (const each of earlier) {
        const path = forward(each.path);
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
    forward: Forward,
): Change | undefined {
    if (!before) return { kind: "group-added", path: after.path, in: [input], after };
    if (!after) return { kind: "group-removed", path: before.path, in: [input], before };
    const properties = groupDifferences(before, after, forward);
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
    forward: Forward,
): Change | undefined {
    if (!before) return { kind: "added", path: after.path, in: [input], after };
    if (!after) return { kind: "removed", path: before.path, in: [input], before };
    const properties = tokenDifferences(movedReferences(before, forward), after);
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

function groupDifferences(before: Group, after: Group, forward: Forward): GroupProperty[] {
    const same: Record<GroupProperty, boolean> = {
        type: before.type === after.type,
        description: before.description === after.description,
        deprecated: before.deprecated === after.deprecated,
        extensions: sameJson(before.extensions, after.extensions),
        extends: (before.extends && forward(before.extends)) === after.extends,
    };
    return differing(same);
}

function differing<P extends string>(same: Record<P, boolean>): P[] {
    return (Object.keys(same) as P[]).filter((property) => !same[property]);
}

function saidType(token: Token): string | undefined {
    return !token.authored || token.authored.typeDeclared ? token.type : undefined;
}

function saidDeprecation(token: Token): Token["deprecated"] {
    return !token.authored || token.authored.deprecatedDeclared ? token.deprecated : undefined;
}

class Changes {
    readonly list: Change[] = [];
    readonly #byPath = new Map<string, Change[]>();

    add(change: Change | undefined): void {
        if (!change) return;
        const key = `${change.kind} ${change.path}`;
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

function sameSides(a: Change, b: Change): boolean {
    const before = "before" in a && "before" in b ? sameSide(a.before, b.before) : true;
    const after = "after" in a && "after" in b ? sameSide(a.after, b.after) : true;
    return before && after;
}

function sameSide(a: Token | Group, b: Token | Group): boolean {
    if (a.path !== b.path) return false;
    if ("source" in a) return "source" in b && tokenDifferences(a, b).length === 0;
    return !("source" in b) && groupDifferences(a, b, unmoved).length === 0;
}

type Forward = (path: string) => string;

const unmoved: Forward = (path) => path;

function movedReferences(before: Token, forward: Forward): Token {
    if (before.value === undefined) return before;
    return { ...before, value: forwarded(before.value, forward) } as Token;
}

function forwarded(value: unknown, forward: Forward): unknown {
    if (isAlias(value)) return { alias: forward(value.alias) };
    if (isPointer(value)) return { pointer: forwardPointer(value.pointer, forward) };
    if (Array.isArray(value)) return value.map((each) => forwarded(each, forward));
    if (typeof value === "object" && value !== null) {
        return Object.fromEntries(
            Object.entries(value).map(([key, each]) => [key, forwarded(each, forward)]),
        );
    }
    return value;
}

function forwardPointer(pointer: string, forward: Forward): string {
    const steps = refSteps(pointer);
    if (!steps) return pointer;
    const { path, inside } = pointerParts(steps);
    const moved = forward(path);
    if (moved === path) return pointer;
    return encodePointer([...moved.split("."), ...(inside ? ["$value", ...inside] : [])]);
}
