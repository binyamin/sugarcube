import {
    type Document,
    type Group,
    type Input,
    type Permutation,
    type Place as WrittenPlace,
    type Project,
    type ResolverContext,
    type Source,
    type Span,
    type Token,
    completeInput,
    group,
    parentOf,
    permutation,
    token,
} from "@sugarcube-sh/dtcg";
import { refused } from "./error-messages.js";
import type { Decision, Refusal, Where } from "./index.js";
import { type Place, placeOf, spanKey, writtenAt } from "./project-text.js";

type Placement =
    | { token: Token; at: Place; alsoAffects: Input[] }
    | { token: Token; into: string; alsoAffects: Input[] }
    | { decision: Decision }
    | { refused: Refusal };

type Declared = { at: Place; alsoAffects: Input[] } | { refused: Refusal };

type NewPlace =
    | { into: string; alsoAffects: Input[] }
    | { decision: Decision }
    | { refused: Refusal };

interface Chosen {
    perm: Permutation;
    context: ResolverContext;
}

export function placement(project: Project, path: string, where: Where = {}): Placement {
    const chosen = chosenContext(project.doc, where.context ?? {});
    if (chosen === undefined) return sharedPlace(project, path);
    if ("refused" in chosen) return chosen;
    return contextPlace(project, path, chosen, where.place);
}

export function groupPlace(project: Project, path: string): Declared {
    const { doc } = project;
    const perm = permutation(doc) ?? doc.permutations[0];
    const declared = perm && group(perm, path);
    if (!perm || !declared) return refused({ kind: "not-found", path });
    const refusal = refusalFor(declared);
    if (refusal) return refusal;
    const placed = declared.writtenAt.flatMap(({ source, span }) => {
        const place = placeOf(project, span);
        return place ? [{ place, shared: source.readBy === "everyone" }] : [];
    });
    const at =
        placed.find(
            ({ place }) =>
                writtenAt(project, place.span.file, [...place.path, "$description"]) !== undefined,
        )?.place ??
        placed.find(({ shared }) => shared)?.place ??
        placed[0]?.place;
    if (!at) return refused({ kind: "not-found", path });
    return { at, alsoAffects: seenBy(doc, path, at.span.file) };
}

type Copies = { places: Place[]; alsoAffects: Input[] } | { refused: Refusal };

export function tokenCopies(project: Project, path: string): Copies | undefined {
    const first = project.doc.permutations.flatMap((perm) => token(perm, path) ?? [])[0];
    return first && (refusalFor(first) ?? copiesAt(project, path));
}

export function groupCopies(project: Project, path: string): Copies | undefined {
    const first = project.doc.permutations.flatMap((perm) => group(perm, path) ?? [])[0];
    return first && (refusalFor(first) ?? copiesAt(project, path));
}

function copiesAt(project: Project, path: string): Copies {
    const places = project.doc.writtenAt(path).flatMap(({ span }) => placeOf(project, span) ?? []);
    const alsoAffects = inputsOf(
        project.doc,
        (perm) => (token(perm, path) ?? group(perm, path)) !== undefined,
    );
    return { places, alsoAffects };
}

function inputsOf(doc: Document, affected: (perm: Permutation) => boolean): Input[] {
    return doc.permutations
        .filter((perm) => Object.keys(perm.input).length > 0 && affected(perm))
        .map((perm) => perm.input);
}

export function newPlace(project: Project, path: string, where: Where = {}): NewPlace {
    const { doc } = project;
    const parent = parentOf(path);
    const chosen = chosenContext(doc, where.context ?? {});
    if (chosen && "refused" in chosen) return chosen;
    const perm = chosen?.perm ?? permutation(doc) ?? doc.permutations[0];
    if (!perm) return refused({ kind: "not-found", path: parent ?? path });
    if (parent !== undefined && token(perm, parent)) {
        return refused({ kind: "not-a-group", path: parent });
    }
    const groupPlaces = parent === undefined ? [] : group(perm, parent)?.writtenAt;
    if (!groupPlaces) return refused({ kind: "not-found", path: parent ?? path });
    const existing = token(perm, path);
    if (chosen && existing && !isFrom(existing.writtenAt.at(-1)?.source, chosen)) {
        return refused({ kind: "override-instead", path, context: contextOf(chosen) });
    }
    if (existing || group(perm, path)) return refused({ kind: "taken", path });

    const files = [...new Set(writable(project, perm, chosen).map(({ file }) => file))];
    if (files.length === 0) {
        return chosen
            ? refused({ kind: "no-file-for-context", path, context: contextOf(chosen) })
            : refused({ kind: "no-shared-file", path });
    }
    const into = chosenFile(path, files, groupPlaces, where.place);
    if (typeof into !== "string") return into;
    return { into, alsoAffects: seenBy(doc, path, into, chosen) };
}

function chosenContext(doc: Document, input: Input): Chosen | { refused: Refusal } | undefined {
    if (Object.keys(input).length === 0) return undefined;
    const complete = completeInput(doc, input);
    if (!complete.ok) {
        return refused({ kind: "no-permutation", context: input, why: complete.reason });
    }
    const perm = permutation(doc, complete.input);
    if (!perm) return refused({ kind: "no-permutation", context: input, why: "not-read" });
    const away = perm.contexts.filter((context) => !context.isDefault);
    const [context] = away;
    if (context === undefined) return undefined;
    if (away.length > 1) {
        const named = Object.fromEntries(away.map((each) => [each.modifier.name, each.name]));
        return refused({ kind: "several-contexts", context: named });
    }
    return { perm, context };
}

function sharedPlace(project: Project, path: string): Placement {
    const { doc } = project;
    const perm = doc.permutations.find((each) => token(each, path) !== undefined);
    const first = perm && token(perm, path);
    if (!perm || !first) return refused({ kind: "not-found", path });
    const refusal = refusalFor(first);
    if (refusal) return refusal;

    let shared: WrittenPlace | undefined;
    for (const each of first.writtenAt) if (each.source.readBy === "everyone") shared = each;
    const at = shared && placeOf(project, shared.span);
    if (!at) return refused({ kind: "no-shared-value", path });
    return { token: first, at, alsoAffects: seenBy(doc, path, at.span) };
}

function contextPlace(
    project: Project,
    path: string,
    chosen: Chosen,
    place: string | undefined,
): Placement {
    const { doc } = project;
    const { perm } = chosen;
    const context = contextOf(chosen);
    const written = token(perm, path);
    if (!written) return refused({ kind: "not-found", path });
    const refusal = refusalFor(written);
    if (refusal) return refusal;

    const winner = written.writtenAt.at(-1);
    if (!winner) return refused({ kind: "not-found", path });
    if (isFrom(winner.source, chosen)) {
        const at = placeOf(project, winner.span);
        if (!at) return refused({ kind: "not-found", path });
        return { token: written, at, alsoAffects: seenBy(doc, path, at.span, chosen) };
    }

    const own = writable(project, perm, chosen);
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
    return { token: written, into, alsoAffects: seenBy(doc, path, into, chosen) };
}

function writable(
    project: Project,
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
    groupPlaces: WrittenPlace[],
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

function seenBy(doc: Document, path: string, where: Span | string, chosen?: Chosen): Input[] {
    const reads = (perm: Permutation) => {
        if (typeof where === "string") return perm.sources.some(({ file }) => file === where);
        const at = token(perm, path)?.writtenAt.at(-1)?.span;
        return at !== undefined && spanKey(at) === spanKey(where);
    };
    return inputsOf(
        doc,
        (perm) => !(chosen && perm.contexts.includes(chosen.context)) && reads(perm),
    );
}

function isFrom(source: Source | undefined, chosen: Chosen): boolean {
    return source !== undefined && source.context === chosen.context;
}
