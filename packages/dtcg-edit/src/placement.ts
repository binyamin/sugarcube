import {
    type Document,
    type Input,
    type JsonPath,
    type Permutation,
    type Project,
    type Source,
    type Span,
    type Token,
    completeInput,
    group,
    permutation,
    token,
} from "@sugarcube-sh/dtcg";
import { refused } from "./error-messages.js";
import type { Decision, Json, Refusal, Where } from "./index.js";
import { pathAt } from "./json-text.js";
import { valueAt } from "./text-edits.js";

export interface Place {
    span: Span;
    path: JsonPath;
}

export type Placement =
    | { token: Token; at: Place; alsoAffects: Input[] }
    | { token: Token; into: string; alsoAffects: Input[] }
    | { decision: Decision }
    | { refused: Refusal };

type Declared = { at: Place; alsoAffects: Input[] } | { refused: Refusal };

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

export function declaredPlace(project: Project, path: string): Declared {
    const { doc } = project;
    if (doc.permutations.some((perm) => token(perm, path))) return sharedPlace(project, path);

    const declared = group(doc, path);
    if (!declared) return refused({ kind: "not-found", path });
    if (declared.inherited) {
        return refused({ kind: "inherited", path, from: declared.inherited.from });
    }
    const places = declared.declaredIn.flatMap((span) => placeOf(project, span) ?? []);
    const at =
        places.find((each) => writtenAt(project, each, "$description") !== undefined) ??
        places.find((each) => doc.usedBy[each.span.file] === "everyone") ??
        places[0];
    if (!at) return refused({ kind: "not-found", path });
    return { at, alsoAffects: seenBy(doc, path, at.span.file) };
}

export function writtenAt(project: Project, at: Place, key: string): Json | undefined {
    return valueAt(project.files[at.span.file] ?? "", [...at.path, key]);
}

function chosenContext(doc: Document, input: Input): Chosen | { refused: Refusal } | undefined {
    if (Object.keys(input).length === 0) return undefined;
    const complete = completeInput(doc, input);
    if (!complete.ok) {
        return refused({ kind: "no-permutation", context: input, why: complete.reason });
    }
    const perm = permutation(doc, complete.input);
    if (!perm) return refused({ kind: "no-permutation", context: input, why: "not-read" });
    const away = Object.keys(doc.modifiers).filter(
        (name) => perm.input[name] !== doc.modifiers[name]?.default,
    );
    const [modifier] = away;
    if (modifier === undefined) return undefined;
    if (away.length > 1) {
        const context = Object.fromEntries(away.map((name) => [name, perm.input[name] ?? ""]));
        return refused({ kind: "several-contexts", context });
    }
    return { perm, modifier, name: perm.input[modifier] ?? "" };
}

function sharedPlace(project: Project, path: string): Placement & Declared {
    const { doc } = project;
    const found = doc.permutations.flatMap((perm) => token(perm, path) ?? []);
    const [first] = found;
    if (!first) return refused({ kind: "not-found", path });
    const refusal = refusalFor(first);
    if (refusal) return refusal;

    const written = [...(first.replaces ?? []), first.source.at];
    const shared = written.reduce<Span | undefined>(
        (last, span) => (doc.usedBy[span.file] === "everyone" ? span : last),
        undefined,
    );
    const at = shared && placeOf(project, shared);
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
    const context = { [chosen.modifier]: chosen.name };
    const written = token(perm, path);
    if (!written) return refused({ kind: "not-found", path });
    const refusal = refusalFor(written);
    if (refusal) return refusal;

    if (isFrom(perm.sources[written.source.index], chosen)) {
        const at = placeOf(project, written.source.at);
        if (!at) return refused({ kind: "not-found", path });
        return { token: written, at, alsoAffects: seenBy(doc, path, at.span, chosen) };
    }

    const own = perm.sources.flatMap((source, index) =>
        isFrom(source, chosen) && source.pointer === undefined && source.file !== project.entry
            ? [{ file: source.file, index }]
            : [],
    );
    if (own.length === 0) return refused({ kind: "no-file-for-context", path, context });
    const winning = own.filter((each) => each.index > written.source.index);
    if (winning.length === 0) {
        const file = written.source.at.file;
        return refused({ kind: "hidden-by-later-file", path, context, file });
    }

    const candidates = [...new Set(winning.map((each) => each.file))];
    const parent = path.split(".").slice(0, -1).join(".");
    const declaredIn = parent === "" ? [] : (group(perm, parent)?.declaredIn ?? []);
    const declaring = candidates.filter((each) => declaredIn.some((span) => span.file === each));
    const into =
        candidates.find((each) => each === place) ??
        (candidates.length === 1 ? candidates[0] : undefined) ??
        (declaring.length === 1 ? declaring[0] : undefined);

    if (into === undefined) return { decision: { kind: "placement", path, candidates } };
    return { token: written, into, alsoAffects: seenBy(doc, path, into, chosen) };
}

function refusalFor(found: Token): { refused: Refusal } | undefined {
    const { path, generated, inherited } = found;
    if (generated) return refused({ kind: "generated", path, ...generated });
    if (inherited) return refused({ kind: "inherited", path, from: inherited.from });
    return undefined;
}

function seenBy(doc: Document, path: string, where: Span | string, chosen?: Chosen): Input[] {
    const reads = (perm: Permutation) => {
        if (typeof where === "string") return perm.sources.some(({ file }) => file === where);
        const at = token(perm, path)?.source.at;
        return at?.file === where.file && at.offset === where.offset;
    };
    return doc.permutations
        .filter(
            (perm) =>
                Object.keys(perm.input).length > 0 &&
                !(chosen && perm.input[chosen.modifier] === chosen.name) &&
                reads(perm),
        )
        .map((perm) => perm.input);
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

function placeOf(project: Project, span: Span): Place | undefined {
    const path = pathAt(project.files[span.file] ?? "", span);
    return path && { span, path };
}
