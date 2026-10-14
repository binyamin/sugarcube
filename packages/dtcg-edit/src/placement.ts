import {
    type DesignTokens,
    type Group,
    type Input,
    type Permutation,
    PermutationError,
    type Permutations,
    type PlaceInPermutations,
    type ResolverContext,
    type Source,
    type Span,
    type Token,
    parentOf,
} from "@sugarcube-sh/dtcg";
import { refused } from "./error-messages.js";
import type { OpResult, Question, Refusal, Where } from "./index.js";
import { type Member, memberAt, writtenIn } from "./file-text.js";

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
    | { at: Member; alsoAffects: Permutations }
    | { token: Token; into: string; alsoAffects: Permutations }
    | { choose: Choice }
    | { refused: Refusal };

type NewPlace =
    | { into: string; alsoAffects: Permutations }
    | { choose: Choice }
    | { refused: Refusal };

interface Copy extends Member {
    readers: number;
}

type Copies =
    | { of: "token" | "group"; places: Copy[]; alsoAffects: Permutations }
    | { refused: Refusal };

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

export function newPlace(
    tokens: DesignTokens,
    path: string,
    where: Where = {},
    place?: string,
): NewPlace {
    const chosen = chosenContext(tokens, where.input ?? {});
    if (chosen && "refused" in chosen) return chosen;
    return chosen
        ? newContextPlace(tokens, path, chosen, place)
        : newSharedPlace(tokens, path, place);
}

export function copiesOf(tokens: DesignTokens, path: string): Copies {
    const found = lookUp(tokens, path, (perm) => perm.token(path) ?? perm.group(path));
    if ("refused" in found) return found;
    const places = tokens.writtenAt(path).flatMap(({ span, readIn }) => {
        const member = memberAt(tokens, span);
        if (!member) return [];
        return [{ ...member, readers: readIn.length }];
    });
    const alsoAffects = alsoIn(
        tokens.permutations.where((perm) => (perm.token(path) ?? perm.group(path)) !== undefined),
    );
    return { of: found.of, places, alsoAffects };
}

export function describedPlace(
    tokens: DesignTokens,
    path: string,
    places: Copy[],
    place: string | undefined,
): { at: Member; alsoAffects: Permutations } | { choose: Choice } | { refused: Refusal } {
    const describes = (member: Member) =>
        writtenIn(tokens, member.span.file, [...member.jsonPath, "$description"]) !== undefined;
    const describing = places.find(describes);
    if (describing)
        return { at: describing, alsoAffects: seenReading(tokens, describing.span.file) };
    const most = Math.max(...places.map(({ readers }) => readers));
    const widest = places.filter(({ readers }) => readers === most);
    const file = chosenFile(path, unique(widest.map(({ span }) => span)), [], place);
    if (typeof file !== "string") return file;
    const at = widest.find(({ span }) => span.file === file);
    if (!at) return refused({ kind: "not-found", path });
    return { at, alsoAffects: seenReading(tokens, file) };
}

function lookUp(
    tokens: DesignTokens,
    path: string,
    find: (perm: Permutation) => Token | Group | undefined,
): { of: "token" | "group" } | { refused: Refusal } {
    const found = tokens.permutations.flatMap((perm) => find(perm) ?? []);
    if (found.length === 0) return refused({ kind: "not-found", path });
    for (const each of found) {
        const refusal = refusalFor(each);
        if (refusal) return refusal;
    }
    return { of: found.some(({ kind }) => kind === "token") ? "token" : "group" };
}

function sharedPlace(tokens: DesignTokens, path: string): Placement {
    const found = lookUp(tokens, path, (perm) => perm.token(path));
    if ("refused" in found) return found;
    let shared: PlaceInPermutations | undefined;
    for (const place of tokens.writtenAt(path)) {
        if (place.sources.some(everyoneReads)) shared = place;
    }
    const at = shared && memberAt(tokens, shared.span);
    if (!shared || !at) return refused({ kind: "no-shared-value", path });
    return { at, alsoAffects: alsoIn(shared.winsIn) };
}

function newSharedPlace(tokens: DesignTokens, path: string, place: string | undefined): NewPlace {
    const parent = parentOf(path);
    if (parent !== undefined) {
        if (inAny(tokens, (perm) => perm.token(parent))) {
            return refused({ kind: "not-a-group", path: parent });
        }
        if (!inAny(tokens, (perm) => perm.group(parent))) {
            return refused({ kind: "not-found", path: parent });
        }
    }
    const written = (at: string) =>
        tokens.writtenAt(at).filter((each) => each.sources.some(everyoneReads));
    if (written(path).length > 0) return refused({ kind: "taken", path });

    const files = unique(
        tokens.sources.filter((source) => everyoneReads(source) && !source.pointer),
    );
    if (files.length === 0) return refused({ kind: "no-shared-file", path });
    const parentSpans = parent === undefined ? [] : written(parent).map(({ span }) => span);
    const into = chosenFile(path, files, parentSpans, place);
    if (typeof into !== "string") return into;
    return { into, alsoAffects: seenReading(tokens, into) };
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
    if (winner.source.context === chosen.context) {
        const there = tokens.writtenAt(path).find(({ span }) => span === winner.span);
        const at = memberAt(tokens, winner.span);
        if (!there || !at) return refused({ kind: "not-found", path });
        return { at, alsoAffects: alsoIn(there.winsIn, chosen) };
    }

    const own = writable(perm, chosen);
    if (own.length === 0) return refused({ kind: "no-file-for-context", path, input });
    const winnerIndex = perm.sources.indexOf(winner.source);
    const winning = own.filter(({ index }) => index > winnerIndex);
    if (winning.length === 0) {
        return refused({ kind: "hidden-by-later-file", path, input, file: winner.span.file });
    }

    const groupSpans = (written.group?.writtenAt ?? []).map(({ span }) => span);
    const into = chosenFile(path, unique(winning), groupSpans, place);
    if (typeof into !== "string") return into;
    return { token: written, into, alsoAffects: seenReading(tokens, into, chosen) };
}

function newContextPlace(
    tokens: DesignTokens,
    path: string,
    chosen: Chosen,
    place: string | undefined,
): NewPlace {
    const { perm } = chosen;
    const parent = parentOf(path);
    if (parent !== undefined && perm.token(parent)) {
        return refused({ kind: "not-a-group", path: parent });
    }
    const groupPlaces = parent === undefined ? [] : perm.group(parent)?.writtenAt;
    if (!groupPlaces) return refused({ kind: "not-found", path: parent ?? path });
    const existing = perm.token(path);
    if (existing && existing.valueFrom.source.context !== chosen.context) {
        return refused({ kind: "override-instead", path, input: inputOf(chosen) });
    }
    if (existing || perm.group(path)) return refused({ kind: "taken", path });

    const files = unique(writable(perm, chosen));
    if (files.length === 0) {
        return refused({ kind: "no-file-for-context", path, input: inputOf(chosen) });
    }
    const groupSpans = groupPlaces.map(({ span }) => span);
    const into = chosenFile(path, files, groupSpans, place);
    if (typeof into !== "string") return into;
    return { into, alsoAffects: seenReading(tokens, into, chosen) };
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

function writable(perm: Permutation, chosen: Chosen): { file: string; index: number }[] {
    return perm.sources.flatMap(({ context, pointer, file }, index) =>
        context === chosen.context && !pointer ? [{ file, index }] : [],
    );
}

function chosenFile(
    path: string,
    candidates: string[],
    groupSpans: Span[],
    place: string | undefined,
): string | { choose: Choice } {
    if (place !== undefined && candidates.includes(place)) return place;
    const declaring = candidates.filter((file) => groupSpans.some((span) => span.file === file));
    const pool = declaring.length > 0 ? declaring : candidates;
    const [only] = pool;
    if (only !== undefined && pool.length === 1) return only;
    return { choose: { path, files: pool } };
}

function everyoneReads({ readBy }: Source): boolean {
    return readBy === "everyone";
}

function inAny(tokens: DesignTokens, find: (perm: Permutation) => unknown): boolean {
    return tokens.permutations.some((perm) => find(perm) !== undefined);
}

function unique(sources: { file: string }[]): string[] {
    return [...new Set(sources.map(({ file }) => file))];
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

function seenReading(tokens: DesignTokens, file: string, chosen?: Chosen): Permutations {
    return alsoIn(
        tokens.permutations.where((perm) => perm.sources.some((source) => source.file === file)),
        chosen,
    );
}

function alsoIn(among: Permutations, chosen?: Chosen): Permutations {
    return among.where(
        (perm) => perm.contexts.length > 0 && (!chosen || !perm.contexts.includes(chosen.context)),
    );
}
