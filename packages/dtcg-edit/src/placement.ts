import {
    type DesignSystem,
    type Group,
    type Input,
    type Permutation,
    PermutationError,
    type Place,
    type ResolverContext,
    type Source,
    type Span,
    type Token,
    parentOf,
} from "@sugarcube-sh/dtcg";
import { refused } from "./error-messages.js";
import type { Decision, Refusal, Where } from "./index.js";
import { type Member, memberAt, spanKey, writtenIn } from "./file-text.js";

type Placement =
    | { token: Token; at: Member; alsoAffects: Input[] }
    | { token: Token; into: string; alsoAffects: Input[] }
    | { decision: Decision }
    | { refused: Refusal };

type Declared = { at: Member; alsoAffects: Input[] } | { refused: Refusal };

type NewPlace =
    | { into: string; alsoAffects: Input[] }
    | { decision: Decision }
    | { refused: Refusal };

interface Chosen {
    perm: Permutation;
    context: ResolverContext;
}

export function placement(ds: DesignSystem, path: string, where: Where = {}): Placement {
    const chosen = chosenContext(ds, where.context ?? {});
    if (chosen === undefined) return sharedPlace(ds, path);
    if ("refused" in chosen) return chosen;
    return contextPlace(ds, path, chosen, where.place);
}

export function groupPlace(ds: DesignSystem, path: string): Declared {
    const declared = sharedPermutation(ds)?.group(path);
    if (!declared) return refused({ kind: "not-found", path });
    const refusal = refusalFor(declared);
    if (refusal) return refusal;
    const placed = declared.writtenAt.flatMap(({ source, span }) => {
        const member = memberAt(ds, span);
        return member ? [{ member, shared: source.readBy === "everyone" }] : [];
    });
    const at =
        placed.find(
            ({ member }) =>
                writtenIn(ds, member.span.file, [...member.jsonPath, "$description"]) !== undefined,
        )?.member ??
        placed.find(({ shared }) => shared)?.member ??
        placed[0]?.member;
    if (!at) return refused({ kind: "not-found", path });
    return { at, alsoAffects: seenBy(ds, path, at.span.file) };
}

type Copies = { places: Member[]; alsoAffects: Input[] } | { refused: Refusal };

export function tokenCopies(ds: DesignSystem, path: string): Copies | undefined {
    const first = firstIn(ds, (perm) => perm.token(path));
    return first && (refusalFor(first) ?? copiesAt(ds, path));
}

export function groupCopies(ds: DesignSystem, path: string): Copies | undefined {
    const first = firstIn(ds, (perm) => perm.group(path));
    return first && (refusalFor(first) ?? copiesAt(ds, path));
}

function firstIn<T>(ds: DesignSystem, find: (perm: Permutation) => T | undefined): T | undefined {
    for (const perm of ds.permutations) {
        const found = find(perm);
        if (found) return found;
    }
    return undefined;
}

function sharedPermutation(ds: DesignSystem): Permutation | undefined {
    return ds.permutations.find((perm) => perm.isDefault) ?? ds.permutations[0];
}

function copiesAt(ds: DesignSystem, path: string): Copies {
    const places = ds.writtenAt(path).flatMap(({ span }) => memberAt(ds, span) ?? []);
    const alsoAffects = inputsOf(
        ds,
        (perm) => (perm.token(path) ?? perm.group(path)) !== undefined,
    );
    return { places, alsoAffects };
}

function inputsOf(ds: DesignSystem, affected: (perm: Permutation) => boolean): Input[] {
    return ds.permutations
        .filter((perm) => Object.keys(perm.input).length > 0 && affected(perm))
        .map((perm) => perm.input);
}

export function newPlace(ds: DesignSystem, path: string, where: Where = {}): NewPlace {
    const parent = parentOf(path);
    const chosen = chosenContext(ds, where.context ?? {});
    if (chosen && "refused" in chosen) return chosen;
    const perm = chosen?.perm ?? sharedPermutation(ds);
    if (!perm) return refused({ kind: "not-found", path: parent ?? path });
    if (parent !== undefined && perm.token(parent)) {
        return refused({ kind: "not-a-group", path: parent });
    }
    const groupPlaces = parent === undefined ? [] : perm.group(parent)?.writtenAt;
    if (!groupPlaces) return refused({ kind: "not-found", path: parent ?? path });
    const existing = perm.token(path);
    if (chosen && existing && !isFrom(existing.valueFrom.source, chosen)) {
        return refused({ kind: "override-instead", path, context: contextOf(chosen) });
    }
    if (existing || perm.group(path)) return refused({ kind: "taken", path });

    const files = [...new Set(writable(ds, perm, chosen).map(({ file }) => file))];
    if (files.length === 0) {
        return chosen
            ? refused({ kind: "no-file-for-context", path, context: contextOf(chosen) })
            : refused({ kind: "no-shared-file", path });
    }
    const into = chosenFile(path, files, groupPlaces, where.place);
    if (typeof into !== "string") return into;
    return { into, alsoAffects: seenBy(ds, path, into, chosen) };
}

function chosenContext(ds: DesignSystem, input: Input): Chosen | { refused: Refusal } | undefined {
    if (Object.keys(input).length === 0) return undefined;
    let perm: Permutation;
    try {
        perm = ds.permutation(input);
    } catch (error) {
        if (!(error instanceof PermutationError)) throw error;
        return refused({ kind: "no-permutation", context: input, why: error.detail.reason });
    }
    const away = perm.contexts.filter((context) => !context.isDefault);
    const [context] = away;
    if (context === undefined) return undefined;
    if (away.length > 1) {
        const named = Object.fromEntries(away.map((each) => [each.modifier.name, each.name]));
        return refused({ kind: "several-contexts", context: named });
    }
    return { perm, context };
}

function sharedPlace(ds: DesignSystem, path: string): Placement {
    const first = firstIn(ds, (perm) => perm.token(path));
    if (!first) return refused({ kind: "not-found", path });
    const refusal = refusalFor(first);
    if (refusal) return refusal;

    let shared: Place | undefined;
    for (const each of first.writtenAt) if (each.source.readBy === "everyone") shared = each;
    const at = shared && memberAt(ds, shared.span);
    if (!at) return refused({ kind: "no-shared-value", path });
    return { token: first, at, alsoAffects: seenBy(ds, path, at.span) };
}

function contextPlace(
    ds: DesignSystem,
    path: string,
    chosen: Chosen,
    place: string | undefined,
): Placement {
    const { perm } = chosen;
    const context = contextOf(chosen);
    const written = perm.token(path);
    if (!written) return refused({ kind: "not-found", path });
    const refusal = refusalFor(written);
    if (refusal) return refusal;

    const winner = written.valueFrom;
    if (isFrom(winner.source, chosen)) {
        const at = memberAt(ds, winner.span);
        if (!at) return refused({ kind: "not-found", path });
        return { token: written, at, alsoAffects: seenBy(ds, path, at.span, chosen) };
    }

    const own = writable(ds, perm, chosen);
    if (own.length === 0) return refused({ kind: "no-file-for-context", path, context });
    const winnerIndex = perm.sources.indexOf(winner.source);
    const winning = own.filter((each) => each.index > winnerIndex);
    if (winning.length === 0) {
        const file = winner.span.file;
        return refused({ kind: "hidden-by-later-file", path, context, file });
    }

    const candidates = [...new Set(winning.map((each) => each.file))];
    const groupPlaces = written.group?.writtenAt ?? [];
    const into = chosenFile(path, candidates, groupPlaces, place);
    if (typeof into !== "string") return into;
    return { token: written, into, alsoAffects: seenBy(ds, path, into, chosen) };
}

function writable(
    ds: DesignSystem,
    perm: Permutation,
    chosen: Chosen | undefined,
): { file: string; index: number }[] {
    return perm.sources.flatMap((source, index) => {
        const reads = chosen ? isFrom(source, chosen) : source.readBy === "everyone";
        return reads && source.pointer === undefined ? [{ file: source.file, index }] : [];
    });
}

function chosenFile(
    path: string,
    candidates: string[],
    groupPlaces: Place[],
    place: string | undefined,
): string | { decision: Decision } {
    if (place !== undefined && candidates.includes(place)) return place;
    const declaring = candidates.filter((file) =>
        groupPlaces.some(({ span }) => span.file === file),
    );
    const pool = declaring.length > 0 ? declaring : candidates;
    const [only] = pool;
    if (only !== undefined && pool.length === 1) return only;
    return { decision: { kind: "placement", path, candidates: pool } };
}

function contextOf({ context }: Chosen): Input {
    return { [context.modifier.name]: context.name };
}

function refusalFor(found: Token | Group): { refused: Refusal } | undefined {
    const { path, inherited } = found;
    const generated = "generated" in found ? found.generated : undefined;
    if (generated) return refused({ kind: "generated", path, ...generated });
    if (inherited) return refused({ kind: "inherited", path, from: inherited.from });
    return undefined;
}

function seenBy(ds: DesignSystem, path: string, where: Span | string, chosen?: Chosen): Input[] {
    const reads = (perm: Permutation) => {
        if (typeof where === "string") return perm.sources.some(({ file }) => file === where);
        const at = perm.token(path)?.valueFrom.span;
        return at !== undefined && spanKey(at) === spanKey(where);
    };
    return inputsOf(
        ds,
        (perm) => !(chosen && perm.contexts.includes(chosen.context)) && reads(perm),
    );
}

function isFrom(source: Source, chosen: Chosen): boolean {
    return source.context === chosen.context;
}
