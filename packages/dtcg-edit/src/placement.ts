import {
    type Document,
    type Group,
    type Input,
    type Permutation,
    type Project,
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
import { type Place, placeOf, spanKey, unique, writtenAt } from "./project-text.js";

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
    modifier: string;
    name: string;
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
    const placed = declared.declaredIn.flatMap(({ index, at: span }) => {
        const place = placeOf(project, span);
        return place ? [{ place, shared: perm.sources[index]?.readBy === "everyone" }] : [];
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
    const found = project.doc.permutations.flatMap((perm) => token(perm, path) ?? []);
    const [first] = found;
    if (!first) return undefined;
    const spans = found.flatMap((each) =>
        (each.replaces ?? []).map(({ at }) => at).concat(each.source.at),
    );
    return refusalFor(first) ?? copiesAt(project, path, spans);
}

export function groupCopies(project: Project, path: string): Copies | undefined {
    const found = project.doc.permutations.flatMap((perm) => group(perm, path) ?? []);
    const [first] = found;
    if (!first) return undefined;
    const spans = found.flatMap((each) => each.declaredIn.map(({ at }) => at));
    return refusalFor(first) ?? copiesAt(project, path, spans);
}

function copiesAt(project: Project, path: string, spans: Span[]): Copies {
    const places = unique(spans).flatMap((span) => placeOf(project, span) ?? []);
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
    const declaredIn = parent === undefined ? [] : group(perm, parent)?.declaredIn;
    if (!declaredIn) return refused({ kind: "not-found", path: parent ?? path });
    const existing = token(perm, path);
    if (chosen && existing && !isFrom(perm.sources[existing.source.index], chosen)) {
        return refused({ kind: "override-instead", path, context: contextOf(chosen) });
    }
    if (existing || group(perm, path)) return refused({ kind: "taken", path });

    const files = [...new Set(writable(project, perm, chosen).map(({ file }) => file))];
    if (files.length === 0) {
        return chosen
            ? refused({ kind: "no-file-for-context", path, context: contextOf(chosen) })
            : refused({ kind: "no-shared-file", path });
    }
    const into = chosenFile(path, files, declaredIn, where.place);
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
    const away = (doc.resolver?.modifiers ?? [])
        .filter(({ name, default: fallback }) => perm.input[name] !== fallback)
        .map(({ name }) => name);
    const [modifier] = away;
    if (modifier === undefined) return undefined;
    if (away.length > 1) {
        const context = Object.fromEntries(away.map((name) => [name, perm.input[name] ?? ""]));
        return refused({ kind: "several-contexts", context });
    }
    return { perm, modifier, name: perm.input[modifier] ?? "" };
}

function sharedPlace(project: Project, path: string): Placement {
    const { doc } = project;
    const perm = doc.permutations.find((each) => token(each, path) !== undefined);
    const first = perm && token(perm, path);
    if (!perm || !first) return refused({ kind: "not-found", path });
    const refusal = refusalFor(first);
    if (refusal) return refusal;

    const written = [...(first.replaces ?? []), first.source];
    let shared: (typeof written)[number] | undefined;
    for (const each of written) {
        if (perm.sources[each.index]?.readBy === "everyone") shared = each;
    }
    const at = shared && placeOf(project, shared.at);
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

    if (isFrom(perm.sources[written.source.index], chosen)) {
        const at = placeOf(project, written.source.at);
        if (!at) return refused({ kind: "not-found", path });
        return { token: written, at, alsoAffects: seenBy(doc, path, at.span, chosen) };
    }

    const own = writable(project, perm, chosen);
    if (own.length === 0) return refused({ kind: "no-file-for-context", path, context });
    const winning = own.filter((each) => each.index > written.source.index);
    if (winning.length === 0) {
        const file = written.source.at.file;
        return refused({ kind: "hidden-by-later-file", path, context, file });
    }

    const candidates = [...new Set(winning.map((each) => each.file))];
    const parent = parentOf(path);
    const declaredIn = parent === undefined ? [] : (group(perm, parent)?.declaredIn ?? []);
    const into = chosenFile(path, candidates, declaredIn, place);
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
    declaredIn: { at: Span }[],
    place: string | undefined,
): string | { decision: Decision } {
    if (place !== undefined && candidates.includes(place)) return place;
    const declaring = candidates.filter((file) => declaredIn.some(({ at }) => at.file === file));
    const pool = declaring.length > 0 ? declaring : candidates;
    const [only] = pool;
    if (only !== undefined && pool.length === 1) return only;
    return { decision: { kind: "placement", path, candidates: pool } };
}

function contextOf(chosen: Chosen): Input {
    return { [chosen.modifier]: chosen.name };
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
        const at = token(perm, path)?.source.at;
        return at !== undefined && spanKey(at) === spanKey(where);
    };
    return inputsOf(
        doc,
        (perm) => !(chosen && perm.input[chosen.modifier] === chosen.name) && reads(perm),
    );
}

function isFrom(source: Source | undefined, chosen: Chosen): boolean {
    const from = source?.from;
    return (
        from !== undefined &&
        "modifier" in from &&
        from.modifier === chosen.modifier &&
        from.context === chosen.name
    );
}
