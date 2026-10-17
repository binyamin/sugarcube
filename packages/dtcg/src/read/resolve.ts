import { relatedMessages } from "../error-messages.js";
import type {
    Diagnostic,
    DiagnosticDetailByKind,
    DiagnosticKind,
    Group,
    JsonPath,
    ParseResult,
    Permutation,
    Place,
    Reference,
    Source,
    Span,
    Token,
    TokenType,
    TopLevel,
    UnresolvedValue,
    ValueByType,
    Written,
    WrittenReference,
} from "../index.js";
import type { Building } from "./building.js";
import { type DiagnosticExtra, diagnostic } from "./diagnostics.js";
import { applying, inherited } from "./inherit.js";
import type { Merged, MergedGroup, MergedToken, MergedTopLevel, WrittenAt } from "./merge.js";
import type { Properties } from "./walk.js";
import type { NormalisedPermutation, NormalisedToken } from "./normalise.js";
import type { LocatedReference, ValueReader } from "./parse-value.js";
import { malformation } from "./malformed-pointer.js";
import { reach, stepInto } from "./ref-meaning.js";
import { similarName } from "./similar.js";
import { movedReference, namedPath, referenceText } from "../values/references.js";
import { type Occurrence, wholeReference } from "./occurrence.js";
import { type Resolving, UNRESOLVED, resolveValue } from "./resolve-value.js";
import {
    NO_PLACES,
    NO_REFERENCES,
    linkedGroup,
    linkedPermutation,
    linkedToken,
    type Places,
    placesIn,
    withIndex,
} from "./linked.js";
import { linkedReference } from "./reference.js";
import { withoutRoot } from "../path.js";

interface Resolved {
    type: TokenType;
    read: ParseResult<unknown>;
    references: LocatedReference[];
    resolved?: unknown;
}

type Outcome = Resolved | "untyped";

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

export function resolvePermutations(
    permutations: NormalisedPermutation[],
    readValue: ValueReader,
    diagnostics: Diagnostic[],
): Permutation[] {
    const places = placesIn();
    return permutations.map((permutation) =>
        resolvePermutation(permutation, { readValue, diagnostics, places }),
    );
}

interface Context {
    readValue: ValueReader;
    diagnostics: Diagnostic[];
    places: Places;
}

function resolvePermutation(
    permutation: NormalisedPermutation,
    { readValue, diagnostics, places }: Context,
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
        diagnostics.push(
            diagnostic(kind, detail, { span, path, permutation: permutation.input, ...extra }),
        );

    const recordMissing = (reference: WrittenReference, from: string, span: Span) => {
        const ref = referenceText(reference);
        const entry = missing.get(ref) ?? { reference, first: { from, span }, from: [], uses: [] };
        if (!entry.from.includes(from)) entry.from.push(from);
        entry.uses.push(span);
        missing.set(ref, entry);
    };

    const reportUnreachable = (use: Occurrence, from: string) => {
        const { reference } = use;
        const malformed =
            reference.syntax === "json-pointer" && malformation(reference.pointer, merged);
        if (malformed) {
            report("malformed-pointer", malformed, from, use.span);
            return;
        }
        const isGroup =
            reference.syntax === "curly-brace"
                ? merged.groups.has(reference.path)
                : reach(use.steps, merged).kind === "group";
        if (isGroup) report("not-a-token", { ref: referenceText(reference) }, from, use.span);
        else recordMissing(reference, from, use.span);
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
        if (whole.reference.syntax === "curly-brace") {
            const { path } = whole.reference;
            return { kind: "token", path, outcome: outcomeOf(path, token.path, whole.span) };
        }
        const reached = reach(whole.steps, merged);
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
                reportUnreachable(whole, token.path);
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
                if (target === undefined) reportUnreachable(whole, token.path);
                if (target === undefined || target === "untyped") return fallback(entry, type);
                if (!("resolved" in target)) return unresolved(entry, type ?? target.type);
                type ??= target.type;
            }
        }
        if (type === undefined) return "untyped";

        const {
            result: read,
            references,
            readAgain,
        } = entry.read ?? readValue.read(token, type, input);
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
        const type = inherited(token, merged, "type");
        return type === "unusable" ? undefined : type;
    };

    const unresolved = (entry: NormalisedToken, type: TokenType): Outcome => {
        const { result: read, references } = entry.read ?? readValue.read(entry.token, type, input);
        return { type, read, references };
    };

    const resolving: Resolving = {
        readValue,
        merged,
        permutation: permutation.input,
        outcomeOf,
        report,
        recordMissing,
        reportUnreachable,
    };

    const { input, label, contexts, sources } = permutation;
    const sourceAt = (index: number) => sources[index] as Source;
    const placed = (written: WrittenAt[]): Place[] => {
        const [first, ...rest] = written;
        if (!first) return NO_PLACES;
        if (rest.length === 0) return places.only(sourceAt(first.index), first.span);
        return written.map(({ index, span }) => places.at(sourceAt(index), span));
    };
    const linked: Building<Permutation> = linkedPermutation({
        input,
        label,
        sources,
        contexts,
        root: publicTopLevel(merged.root, placed(merged.root.declaredIn)),
        children: [],
        tokens: [],
        groups: [],
    });

    const groups = new Map<string, Building<Group>>();
    for (const group of merged.groups.values()) {
        const writtenAt = placed(group.declaredIn);
        groups.set(group.path, publicGroup(group, applying(merged, group), writtenAt));
    }

    const built = new Map<string, Token>();
    const written: [Building<Token>, LocatedReference[]][] = [];
    const childrenOf = (parentPath: string | undefined, parent: Building<Group> | undefined) => {
        const children: (Token | Group)[] = [];
        for (const path of merged.children.get(parentPath) ?? []) {
            const entry = tokens.get(path);
            if (entry) {
                const outcome = resolveToken(entry);
                if (outcome === "untyped") continue;
                const { replaces, piece, span } = entry.token;
                const writtenAt = replaces
                    ? [...placed(replaces), places.at(sourceAt(piece.source), span)]
                    : places.only(sourceAt(piece.source), span);
                const token = toToken(entry.token, outcome, merged, parent, linked, writtenAt);
                if (parent && withoutRoot(path) === parent.path) parent.rootToken = token;
                built.set(path, token);
                if (outcome.references.length > 0) written.push([token, outcome.references]);
                children.push(token);
                continue;
            }
            const group = groups.get(path);
            if (!group) continue;
            group.group = parent;
            group.children = childrenOf(path, group);
            children.push(group);
        }
        return children;
    };
    linked.children = childrenOf(undefined, undefined);

    const referenceOf = (
        from: Token | Group,
        reference: WrittenReference,
        steps: string[] | undefined,
        span: Span,
        property: JsonPath,
        { pointerAlone = false } = {},
    ): Reference => {
        const { path, token, targetProperty } = targetOf(reference, steps, merged, built);
        const facts = {
            reference,
            path,
            span,
            property: property.length > 0 ? property : undefined,
            targetProperty,
        };
        return linkedReference(facts, from, token, { pointerAlone });
    };
    for (const [token, located] of written) {
        token.references = located.map(({ occurrence: { reference, steps, span, property } }) =>
            referenceOf(token, reference, steps, span, property),
        );
    }
    for (const each of merged.groups.values()) {
        const group = groups.get(each.path);
        if (!group || !each.extends) continue;
        const { reference, steps, span, keyword } = each.extends;
        const pointerAlone = keyword === "$ref";
        group.references = [referenceOf(group, reference, steps, span, [], { pointerAlone })];
        if (each.extendsGroup) group.extends = groups.get(each.extendsGroup);
    }

    for (const [ref, { reference, first, from, uses }] of missing) {
        const similar = similarReference(reference, tokens, from);
        const related = uses
            .filter((span) => span !== first.span)
            .map((span) => ({ message: relatedMessages.alsoUsedHere, span }));
        const detail = { ref, from, ...(similar !== undefined && { similar }) };
        report("missing-reference", detail, first.from, first.span, {
            ...(related.length > 0 && { related }),
        });
    }

    linked.tokens = [...built.values()];
    linked.groups = [...groups.values()];
    withIndex(linked, built, groups);
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

function targetOf(
    reference: WrittenReference,
    steps: string[] | undefined,
    merged: Merged,
    built: Map<string, Token>,
): { path?: string | undefined; token?: Token | undefined; targetProperty?: JsonPath } {
    if (reference.syntax === "curly-brace") {
        return { path: reference.path, token: built.get(reference.path) };
    }
    const reached = reach(steps, merged);
    if (reached.kind === "nothing") return { path: namedPath(reference) };
    if (reached.kind === "group") return { path: reached.path };
    const { path } = reached;
    if (reached.kind === "token") return { path, token: built.get(path) };
    const targetProperty = stepInto(reached.token.authored, reached.inside)?.property;
    return targetProperty ? { path, targetProperty } : { path };
}

function publicTopLevel(top: MergedTopLevel, writtenAt: Place[]): TopLevel {
    return { ...publicProperties(top), writtenAt };
}

function publicGroup(group: MergedGroup, applies: Properties, writtenAt: Place[]): Group {
    const { path, inherited: from } = group;
    const authored = publicProperties(group);
    return linkedGroup({
        path,
        ...publicProperties(applies),
        writtenAt,
        children: [],
        references: NO_REFERENCES,
        ...(from && { inherited: from }),
        ...(Object.keys(authored).length > 0 && { authored }),
    });
}

function publicProperties({ type, description, deprecated, extensions }: Properties): Written {
    return {
        ...(type !== undefined && type !== "unusable" && { type }),
        ...(description !== undefined && { description }),
        ...(deprecated !== undefined && { deprecated }),
        ...(extensions && { extensions }),
    };
}

function toToken<T extends TokenType>(
    token: MergedToken,
    outcome: Resolved & { type: T },
    merged: Merged,
    group: Group | undefined,
    permutation: Permutation,
    writtenAt: Place[],
): Token {
    const { read } = outcome;
    return linkedToken({
        path: token.path,
        type: outcome.type,
        group,
        permutation,
        references: NO_REFERENCES,
        writtenAt,
        value: read.ok ? (read.value as UnresolvedValue<T>) : undefined,
        resolved:
            read.ok && "resolved" in outcome ? (outcome.resolved as ValueByType[T]) : undefined,
        invalid: read.ok ? undefined : true,
        description: token.description,
        deprecated: inherited(token, merged, "deprecated"),
        extensions: token.extensions,
        authored: token.added
            ? undefined
            : {
                  value: token.authored,
                  ...publicProperties({ type: token.type, deprecated: token.deprecated }),
              },
        generated: token.generated,
        inherited: token.inherited,
    } as Parameters<typeof linkedToken>[0]);
}
