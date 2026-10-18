import { relatedMessages } from "../error-messages.js";
import type {
    DesignTokens,
    DiagnosticDetailByKind,
    DiagnosticKind,
    Input,
    ParseResult,
    Permutation,
    Span,
    TokenType,
    WrittenReference,
} from "../index.js";
import { type Earlier, buildPermutation, earlierIn } from "./build.js";
import {
    type DiagnosticExtra,
    diagnostic,
    foundInPermutation,
    type Problems,
} from "./diagnostics.js";
import { inherited } from "./inherit.js";
import type { MergedToken } from "./merge.js";
import type { NormalisedPermutation, NormalisedToken } from "./normalise.js";
import type { LocatedReference, ValueReader } from "./parse-value.js";
import { malformation } from "./malformed-pointer.js";
import { type Aim, reachOf } from "./ref-meaning.js";
import { similarName } from "./similar.js";
import { movedReference, namedPath, referenceText } from "../values/references.js";
import { type Occurrence, wholeReference } from "./occurrence.js";
import { type Resolving, UNRESOLVED, resolveValue } from "./resolve-value.js";
import { type Places, placesIn } from "./linked.js";
import { usableType } from "./walk.js";

interface Resolved {
    type: TokenType;
    read: ParseResult<unknown>;
    references: LocatedReference[];
    resolved?: unknown;
}

export type Outcome = Resolved | "untyped";

type Whole =
    | { kind: "token"; path: string; outcome: Outcome | undefined }
    | { kind: "part" }
    | { kind: "unreachable" };

interface Missing {
    reference: WrittenReference;
    first: { from: string; span: Span };
    from: string[];
    uses: Span[];
}

interface MissingAcross {
    ref: string;
    similar: string | undefined;
    first: { from: string; span: Span };
    from: string[];
    uses: Span[];
    inputs: [Input, ...Input[]];
}

export function resolvePermutations(
    permutations: NormalisedPermutation[],
    readValue: ValueReader,
    diagnostics: Problems,
    texts: Readonly<Record<string, string>>,
    previous: DesignTokens | undefined,
): Permutation[] {
    const places = placesIn(texts, previous);
    const missingAcross = new Map<string, MissingAcross>();
    const earlier = earlierIn(previous);
    const resolved = permutations.map((permutation) =>
        resolvePermutation(permutation, { readValue, diagnostics, places, missingAcross, earlier }),
    );
    for (const { ref, similar, first, from, uses, inputs } of missingAcross.values()) {
        const related = uses
            .filter((span) => span !== first.span)
            .map((span) => ({ message: relatedMessages.alsoUsedHere, span }));
        const detail = { ref, from, ...(similar !== undefined && { similar }) };
        const [input, ...others] = inputs;
        const found = diagnostic("missing-reference", detail, {
            span: first.span,
            path: first.from,
            permutation: input,
            ...(related.length > 0 && { related }),
        });
        for (const each of others) foundInPermutation(found, each);
        diagnostics.found(found);
    }
    return resolved;
}

interface Context {
    readValue: ValueReader;
    diagnostics: Problems;
    places: Places;
    missingAcross: Map<string, MissingAcross>;
    earlier: Earlier;
}

function resolvePermutation(
    permutation: NormalisedPermutation,
    { readValue, diagnostics, places, missingAcross, earlier }: Context,
): Permutation {
    const { tokens, merged } = permutation;
    const outcomes = new Map<string, Outcome | "resolving">();
    const stack: { path: string; span: Span }[] = [];
    const missing = new Map<string, Missing>();

    const report = <K extends DiagnosticKind>(
        kind: K,
        detail: DiagnosticDetailByKind[K],
        path: string,
        span: Span,
        extra: Omit<DiagnosticExtra, "span" | "path" | "permutation"> = {},
    ) =>
        diagnostics.found(
            diagnostic(kind, detail, { span, path, permutation: permutation.input, ...extra }),
        );

    const recordMissing = (reference: WrittenReference, from: string, span: Span) => {
        const ref = referenceText(reference);
        const entry = missing.get(ref) ?? { reference, first: { from, span }, from: [], uses: [] };
        if (!entry.from.includes(from)) entry.from.push(from);
        entry.uses.push(span);
        missing.set(ref, entry);
    };

    const notReached = (aim: Aim, from: string, span: Span) => {
        const { reference } = aim;
        if (reachOf(aim, merged).kind === "group") {
            report("not-a-token", { ref: referenceText(reference) }, from, span);
        } else recordMissing(reference, from, span);
    };

    const reportUnreachable = (aim: Aim, from: string, span: Span) => {
        const { reference } = aim;
        const malformed =
            reference.syntax === "json-pointer" && malformation(reference.pointer, merged);
        if (malformed) report("malformed-pointer", malformed, from, span);
        else notReached(aim, from, span);
    };

    const outcomeOf = (path: string, from: string, span: Span): Outcome | undefined => {
        const entry = tokens.get(path);
        if (!entry) return merged.tokens.has(path) ? "untyped" : undefined;
        stack.push({ path: from, span });
        const outcome = resolveToken(entry);
        stack.pop();
        return outcome;
    };

    const resolveToken = (entry: NormalisedToken): Outcome => {
        const { path } = entry.token;
        const current = outcomes.get(path);
        if (current === "resolving") {
            const loop = stack.slice(stack.findIndex((frame) => frame.path === path));
            const [first, ...rest] = loop;
            if (first) {
                const chain = [...loop.map((frame) => frame.path), path];
                const related = rest.map((frame) => ({
                    message: relatedMessages.partOfTheLoop,
                    span: frame.span,
                }));
                report("circular-reference", { chain }, first.path, first.span, { related });
            }
            return "untyped";
        }
        if (current) return current;
        outcomes.set(path, "resolving");
        const outcome = compute(entry);
        outcomes.set(path, outcome);
        return outcome;
    };

    const followWhole = (token: MergedToken, whole: Occurrence): Whole => {
        const { reference } = whole;
        if (reference.syntax === "curly-brace") {
            const { path } = reference;
            const outcome = outcomeOf(path, token.path, whole.span);
            return outcome === undefined
                ? { kind: "unreachable" }
                : { kind: "token", path, outcome };
        }
        const reached = reachOf(whole, merged);
        if (reached.kind === "token") {
            const { path } = reached;
            return { kind: "token", path, outcome: outcomeOf(path, token.path, whole.span) };
        }
        return reached.kind === "part" ? { kind: "part" } : { kind: "unreachable" };
    };

    const compute = (entry: NormalisedToken): Outcome => {
        const { token } = entry;
        const whole = wholeReference(token);

        let type = entry.type;
        if (whole) {
            const followed = followWhole(token, whole);
            if (followed.kind === "unreachable") {
                reportUnreachable(whole, token.path, whole.span);
                return fallback(entry, type);
            }
            if (followed.kind === "part") {
                type ??= groupType(token);
                if (type === undefined) {
                    report("missing-type", {}, token.path, token.span);
                    return "untyped";
                }
            } else {
                const target = followed.outcome;
                if (target === undefined || target === "untyped") return fallback(entry, type);
                if (!("resolved" in target)) return unresolved(entry, type ?? target.type);
                type ??= target.type;
            }
        }
        if (type === undefined) return "untyped";

        const { result: read, references, readAgain } = readAs(entry, type);
        const base = { type, read, references };
        if (!read.ok) return base;
        if (references.length === 0) return { ...base, resolved: read.value };

        const value = resolveValue(resolving, token, read.value, references, readAgain);
        return value === UNRESOLVED ? base : { ...base, resolved: value };
    };

    const fallback = (entry: NormalisedToken, type: TokenType | undefined): Outcome => {
        const shown = type ?? groupType(entry.token);
        return shown === undefined ? "untyped" : unresolved(entry, shown);
    };

    const groupType = (token: MergedToken): TokenType | undefined => {
        return usableType(inherited(token, merged, "type"));
    };

    const unresolved = (entry: NormalisedToken, type: TokenType): Outcome => {
        const { result: read, references } = readAs(entry, type);
        return { type, read, references };
    };

    const readAs = (entry: NormalisedToken, type: TokenType) =>
        entry.read ?? readValue.read(entry.token, type, permutation.input);

    const resolving: Resolving = {
        readValue,
        merged,
        permutation: permutation.input,
        outcomeOf,
        report,
        notReached,
        reportUnreachable,
    };

    const linked = buildPermutation(permutation, resolveToken, places, earlier);

    for (const [ref, { reference, first, from, uses }] of missing) {
        const similar = similarReference(reference, tokens, from);
        const key = JSON.stringify([ref, similar]);
        let entry = missingAcross.get(key);
        if (entry) entry.inputs.push(permutation.input);
        else {
            entry = { ref, similar, first, from: [], uses: [], inputs: [permutation.input] };
            missingAcross.set(key, entry);
        }
        for (const each of from) if (!entry.from.includes(each)) entry.from.push(each);
        for (const span of uses) if (!entry.uses.includes(span)) entry.uses.push(span);
    }

    return linked;
}

function similarReference(
    reference: WrittenReference,
    tokens: Map<string, unknown>,
    from: string[],
): string | undefined {
    const named = namedPath(reference);
    if (named === undefined || tokens.has(named)) return undefined;
    const close = similarName(
        named,
        [...tokens.keys()].filter((path) => !from.includes(path)),
    );
    if (close === undefined) return undefined;
    return referenceText(movedReference(reference, [{ from: named, to: close }]));
}
