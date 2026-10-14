import {
    type DesignTokens,
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
import type { OpResult, Question, Refusal, Where } from "./index.js";
import { type Member, memberAt, spanKey, writtenIn } from "./file-text.js";

interface Choice {
    path: string;
    files: string[];
}

export function asked(
    { path, files }: Choice,
    answer: (file: string) => OpResult,
): {
    question: Question;
} {
    return { question: { kind: "placement", path, files, answer } };
}

type Placement =
    | { token: Token; at: Member; alsoAffects: Input[] }
    | { token: Token; into: string; alsoAffects: Input[] }
    | { choose: Choice }
    | { refused: Refusal };

type Declared = { at: Member; alsoAffects: Input[] } | { refused: Refusal };

type NewPlace = { into: string; alsoAffects: Input[] } | { choose: Choice } | { refused: Refusal };

interface Chosen {
    perm: Permutation;
    context: ResolverContext;
}

export function placement(
    tokens: DesignTokens,
    path: string,
    where: Where = {},
    place?: string,
): Placement {
    const chosen = chosenContext(tokens, where.input ?? {});
    if (chosen === undefined) return sharedPlace(tokens, path);
    if ("refused" in chosen) return chosen;
    return contextPlace(tokens, path, chosen, place);
}

export function groupPlace(tokens: DesignTokens, path: string): Declared {
    const declared = sharedPermutation(tokens)?.group(path);
    if (!declared) return refused({ kind: "not-found", path });
    const refusal = refusalFor(declared);
    if (refusal) return refusal;
    const placed = declared.writtenAt.flatMap(({ source, span }) => {
        const member = memberAt(tokens, span);
        return member ? [{ member, shared: source.readBy === "everyone" }] : [];
    });
    const at =
        placed.find(
            ({ member }) =>
                writtenIn(tokens, member.span.file, [...member.jsonPath, "$description"]) !==
                undefined,
        )?.member ??
        placed.find(({ shared }) => shared)?.member ??
        placed[0]?.member;
    if (!at) return refused({ kind: "not-found", path });
    return { at, alsoAffects: seenBy(tokens, path, at.span.file) };
}

type Copies = { places: Member[]; alsoAffects: Input[] } | { refused: Refusal };

export function tokenCopies(tokens: DesignTokens, path: string): Copies | undefined {
    const first = firstIn(tokens, (perm) => perm.token(path));
    return first && (refusalFor(first) ?? copiesAt(tokens, path));
}

export function groupCopies(tokens: DesignTokens, path: string): Copies | undefined {
    const first = firstIn(tokens, (perm) => perm.group(path));
    return first && (refusalFor(first) ?? copiesAt(tokens, path));
}

function firstIn<T>(
    tokens: DesignTokens,
    find: (perm: Permutation) => T | undefined,
): T | undefined {
    for (const perm of tokens.permutations) {
        const found = find(perm);
        if (found) return found;
    }
    return undefined;
}

function sharedPermutation(tokens: DesignTokens): Permutation | undefined {
    return tokens.permutations.find((perm) => perm.isDefault) ?? tokens.permutations[0];
}

function copiesAt(tokens: DesignTokens, path: string): Copies {
    const places = tokens.writtenAt(path).flatMap(({ span }) => memberAt(tokens, span) ?? []);
    const alsoAffects = inputsOf(
        tokens,
        (perm) => (perm.token(path) ?? perm.group(path)) !== undefined,
    );
    return { places, alsoAffects };
}

function inputsOf(tokens: DesignTokens, affected: (perm: Permutation) => boolean): Input[] {
    return tokens.permutations
        .filter((perm) => Object.keys(perm.input).length > 0 && affected(perm))
        .map((perm) => perm.input);
}

export function newPlace(
    tokens: DesignTokens,
    path: string,
    where: Where = {},
    place?: string,
): NewPlace {
    const parent = parentOf(path);
    const chosen = chosenContext(tokens, where.input ?? {});
    if (chosen && "refused" in chosen) return chosen;
    const perm = chosen?.perm ?? sharedPermutation(tokens);
    if (!perm) return refused({ kind: "not-found", path: parent ?? path });
    if (parent !== undefined && perm.token(parent)) {
        return refused({ kind: "not-a-group", path: parent });
    }
    const groupPlaces = parent === undefined ? [] : perm.group(parent)?.writtenAt;
    if (!groupPlaces) return refused({ kind: "not-found", path: parent ?? path });
    const existing = perm.token(path);
    if (chosen && existing && !isFrom(existing.valueFrom.source, chosen)) {
        return refused({ kind: "override-instead", path, input: inputOf(chosen) });
    }
    if (existing || perm.group(path)) return refused({ kind: "taken", path });

    const files = [...new Set(writable(tokens, perm, chosen).map(({ file }) => file))];
    if (files.length === 0) {
        return chosen
            ? refused({ kind: "no-file-for-context", path, input: inputOf(chosen) })
            : refused({ kind: "no-shared-file", path });
    }
    const into = chosenFile(path, files, groupPlaces, place);
    if (typeof into !== "string") return into;
    return { into, alsoAffects: seenBy(tokens, path, into, chosen) };
}

function chosenContext(
    tokens: DesignTokens,
    input: Input,
): Chosen | { refused: Refusal } | undefined {
    if (Object.keys(input).length === 0) return undefined;
    let perm: Permutation;
    try {
        perm = tokens.permutation(input);
    } catch (error) {
        if (!(error instanceof PermutationError)) throw error;
        return refused({ kind: "no-permutation", input, why: error.detail.reason });
    }
    const away = perm.contexts.filter((context) => !context.isDefault);
    const [context] = away;
    if (context === undefined) return undefined;
    if (away.length > 1) {
        const named = Object.fromEntries(away.map((each) => [each.modifier.name, each.name]));
        return refused({ kind: "several-contexts", input: named });
    }
    return { perm, context };
}

function sharedPlace(tokens: DesignTokens, path: string): Placement {
    const first = firstIn(tokens, (perm) => perm.token(path));
    if (!first) return refused({ kind: "not-found", path });
    const refusal = refusalFor(first);
    if (refusal) return refusal;

    let shared: Place | undefined;
    for (const each of first.writtenAt) if (each.source.readBy === "everyone") shared = each;
    const at = shared && memberAt(tokens, shared.span);
    if (!at) return refused({ kind: "no-shared-value", path });
    return { token: first, at, alsoAffects: seenBy(tokens, path, at.span) };
}

function contextPlace(
    tokens: DesignTokens,
    path: string,
    chosen: Chosen,
    place: string | undefined,
): Placement {
    const { perm } = chosen;
    const input = inputOf(chosen);
    const written = perm.token(path);
    if (!written) return refused({ kind: "not-found", path });
    const refusal = refusalFor(written);
    if (refusal) return refusal;

    const winner = written.valueFrom;
    if (isFrom(winner.source, chosen)) {
        const at = memberAt(tokens, winner.span);
        if (!at) return refused({ kind: "not-found", path });
        return { token: written, at, alsoAffects: seenBy(tokens, path, at.span, chosen) };
    }

    const own = writable(tokens, perm, chosen);
    if (own.length === 0) return refused({ kind: "no-file-for-context", path, input });
    const winnerIndex = perm.sources.indexOf(winner.source);
    const winning = own.filter((each) => each.index > winnerIndex);
    if (winning.length === 0) {
        const file = winner.span.file;
        return refused({ kind: "hidden-by-later-file", path, input, file });
    }

    const candidates = [...new Set(winning.map((each) => each.file))];
    const groupPlaces = written.group?.writtenAt ?? [];
    const into = chosenFile(path, candidates, groupPlaces, place);
    if (typeof into !== "string") return into;
    return { token: written, into, alsoAffects: seenBy(tokens, path, into, chosen) };
}

function writable(
    tokens: DesignTokens,
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
): string | { choose: Choice } {
    if (place !== undefined && candidates.includes(place)) return place;
    const declaring = candidates.filter((file) =>
        groupPlaces.some(({ span }) => span.file === file),
    );
    const pool = declaring.length > 0 ? declaring : candidates;
    const [only] = pool;
    if (only !== undefined && pool.length === 1) return only;
    return { choose: { path, files: pool } };
}

function inputOf({ context }: Chosen): Input {
    return { [context.modifier.name]: context.name };
}

function refusalFor(found: Token | Group): { refused: Refusal } | undefined {
    const { path, inherited } = found;
    const generated = "generated" in found ? found.generated : undefined;
    if (generated) return refused({ kind: "generated", path, ...generated });
    if (inherited) return refused({ kind: "inherited", path, from: inherited.from });
    return undefined;
}

function seenBy(
    tokens: DesignTokens,
    path: string,
    where: Span | string,
    chosen?: Chosen,
): Input[] {
    const reads = (perm: Permutation) => {
        if (typeof where === "string") return perm.sources.some(({ file }) => file === where);
        const at = perm.token(path)?.valueFrom.span;
        return at !== undefined && spanKey(at) === spanKey(where);
    };
    return inputsOf(
        tokens,
        (perm) => !(chosen && perm.contexts.includes(chosen.context)) && reads(perm),
    );
}

function isFrom(source: Source, chosen: Chosen): boolean {
    return source.context === chosen.context;
}
