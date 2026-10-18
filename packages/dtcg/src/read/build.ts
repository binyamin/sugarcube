import type {
    Group,
    JsonPath,
    Permutation,
    Place,
    Reference,
    Source,
    Token,
    TopLevel,
    Written,
} from "../index.js";
import { withoutRoot } from "../path.js";
import { namedPath } from "../values/references.js";
import type { Building } from "./building.js";
import { applying, inherited } from "./inherit.js";
import {
    NO_PLACES,
    NO_REFERENCES,
    type Places,
    linkedGroup,
    linkedPermutation,
    linkedToken,
    tokensIn,
    withIndex,
} from "./linked.js";
import type { Merged, MergedGroup, MergedToken, MergedTopLevel, WrittenAt } from "./merge.js";
import type { NormalisedPermutation, NormalisedToken } from "./normalise.js";
import type { Occurrence } from "./occurrence.js";
import type { LocatedReference } from "./parse-value.js";
import { linkedReference } from "./reference.js";
import { reach, stepInto } from "./ref-meaning.js";
import type { Outcome } from "./resolve.js";
import { type MadeFrom, type Target, sameGroup, sameToken } from "./same-object.js";
import type { Properties } from "./walk.js";

export interface Earlier {
    tokens: Map<string, Token[]>;
    groups: Map<string, Group[]>;
}

type Pending<T> = T | typeof BUILDING;

type Aimed<Found> = Omit<Target, "token"> & { token?: Found | undefined; occurrence: Occurrence };

const BUILDING = Symbol("building");

const NO_TARGETS: readonly Aimed<Token>[] = [];

const NONE_MADE: readonly Token[] = [];

export function buildPermutation(
    { input, label, contexts, sources, merged, tokens }: NormalisedPermutation,
    resolveToken: (entry: NormalisedToken) => Outcome,
    places: Places,
    earlier: Earlier,
): Permutation {
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

    const builtTokens = new Map<string, Token>();
    const builtGroups = new Map<string, Group>();
    const building = new Set<string>();
    const finish: (() => void)[] = [];
    const builtToken = (path: string) => builtTokens.get(path);

    const targetsOf = <Found extends Pending<Token>>(
        located: LocatedReference[],
        at: (path: string) => Found | undefined,
    ): Aimed<Found>[] => located.map(({ occurrence }) => aimAt(occurrence, merged, at));

    const targetAt = (path: string): Pending<Token> | undefined =>
        building.has(path) ? BUILDING : tokenAt(path);

    const tokenAt = (path: string, entry = tokens.get(path)): Token | undefined => {
        const done = builtTokens.get(path);
        if (done) return done;
        if (!entry) return undefined;
        const outcome = resolveToken(entry);
        if (outcome === "untyped") return undefined;
        const located = outcome.references;
        let targets: readonly Aimed<Pending<Token>>[] = NO_TARGETS;
        if (located.length > 0) {
            building.add(path);
            targets = targetsOf(located, targetAt);
            building.delete(path);
        }
        const { token: written } = entry;
        const { replaces, piece, span } = written;
        const { read } = outcome;
        const now: MadeFrom = {
            type: outcome.type,
            value: read.ok ? read.value : undefined,
            resolved: read.ok && "resolved" in outcome ? outcome.resolved : undefined,
            invalid: read.ok ? undefined : true,
            deprecated: inherited(written, merged, "deprecated"),
            writtenAt: replaces
                ? [...placed(replaces), places.at(sourceAt(piece.source), span)]
                : places.only(sourceAt(piece.source), span),
        };
        const reached = targets.every(isAimed) ? targets : undefined;
        const token =
            (reached && sharedWith(written, now, reached)) ||
            newToken(written, now, located, reached);
        builtTokens.set(path, token);
        return token;
    };

    const sharedWith = (written: MergedToken, now: MadeFrom, reached: readonly Aimed<Token>[]) => {
        for (const each of earlier.tokens.get(written.path) ?? NONE_MADE) {
            if (sameToken(each, written, now, reached)) return each;
        }
        return undefined;
    };

    const newToken = (
        written: MergedToken,
        now: MadeFrom,
        located: LocatedReference[],
        reached: readonly Aimed<Token>[] | undefined,
    ): Token => {
        const token: Building<Token> = linkedToken(tokenFields(written, now));
        if (located.length > 0) {
            const link = (targets: readonly Aimed<Token>[]) => {
                token.references = targets.map((target) => referenceOf(token, target));
            };
            if (reached) link(reached);
            else finish.push(() => link(targetsOf(located, builtToken)));
        }
        remember(earlier.tokens, written.path, token);
        return token;
    };

    const childrenAt = <Found>(
        parentPath: string | undefined,
        at: (path: string) => Found | undefined,
    ): Found[] => {
        const children: Found[] = [];
        for (const path of merged.children.get(parentPath) ?? []) {
            const child = at(path);
            if (child !== undefined) children.push(child);
        }
        return children;
    };
    const childAt = (path: string) => {
        const entry = tokens.get(path);
        return entry ? tokenAt(path, entry) : groupAt(path);
    };

    const groupAt = (path: string): Group | undefined => {
        const done = builtGroups.get(path);
        if (done) return done;
        const written = merged.groups.get(path);
        if (!written) return undefined;
        const children = childrenAt(path, childAt);
        const extending =
            written.extendsGroup === undefined ? undefined : groupAt(written.extendsGroup);
        const applies = applying(merged, written);
        const writtenAt = placed(written.declaredIn);
        const group =
            earlier.groups
                .get(path)
                ?.find((each) =>
                    sameGroup(each, written, applies, writtenAt, children, extending),
                ) ??
            newGroup(written, groupFields(written, applies, writtenAt), children, extending);
        builtGroups.set(path, group);
        return group;
    };

    const newGroup = (
        written: MergedGroup,
        fields: Parameters<typeof linkedGroup>[0],
        children: (Token | Group)[],
        extending: Group | undefined,
    ): Group => {
        const group: Building<Group> = linkedGroup(fields);
        group.children = children;
        const root = children.find(
            (child): child is Token =>
                child.kind === "token" && withoutRoot(child.path) === written.path,
        );
        if (root) group.rootToken = root;
        if (extending) group.extends = extending;
        if (written.extends) {
            const { reference, steps, span, keyword } = written.extends;
            const target = aimAt({ reference, steps, span, property: [] }, merged, builtToken);
            group.references = [referenceOf(group, target, { pointerAlone: keyword === "$ref" })];
        }
        remember(earlier.groups, written.path, group);
        return group;
    };

    linked.children = childrenAt(undefined, childAt);
    for (const path of merged.groups.keys()) groupAt(path);
    for (const each of finish) each();
    linked.tokens = tokensIn(linked.children);
    linked.groups = [...merged.groups.keys()].flatMap((path) => builtGroups.get(path) ?? []);
    withIndex(linked, builtTokens, builtGroups);
    return linked;
}

function referenceOf(
    from: Token | Group,
    { occurrence: { reference, span, property }, path, token, targetProperty }: Aimed<Token>,
    { pointerAlone = false } = {},
): Reference {
    const facts = {
        reference,
        path,
        span,
        property: property.length > 0 ? property : undefined,
        targetProperty,
    };
    return linkedReference(facts, from, token, { pointerAlone });
}

function remember<T>(earlier: Map<string, T[]>, path: string, each: T): void {
    const list = earlier.get(path);
    if (list) list.push(each);
    else earlier.set(path, [each]);
}

function isAimed(target: Aimed<Pending<Token>>): target is Aimed<Token> {
    return target.token !== BUILDING;
}

function aimAt<Found extends Pending<Token>>(
    occurrence: Occurrence,
    merged: Merged,
    at: (path: string) => Found | undefined,
): Aimed<Found> {
    const { reference, steps } = occurrence;
    let path: string | undefined;
    let token: Found | undefined;
    let targetProperty: JsonPath | undefined;
    if (reference.syntax === "curly-brace") {
        path = reference.path;
        token = at(path);
    } else {
        const reached = reach(steps, merged);
        if (reached.kind === "nothing") path = namedPath(reference);
        else {
            path = reached.path;
            if (reached.kind === "token") token = at(path);
            else if (reached.kind === "part") {
                targetProperty = stepInto(reached.token.authored, reached.inside)?.property;
            }
        }
    }
    return { occurrence, path, token, targetProperty };
}

function publicTopLevel(top: MergedTopLevel, writtenAt: Place[]): TopLevel {
    return { ...publicProperties(top), writtenAt };
}

function groupFields(
    group: MergedGroup,
    applies: Properties,
    writtenAt: readonly Place[],
): Parameters<typeof linkedGroup>[0] {
    const { path, inherited: from } = group;
    const authored = publicProperties(group);
    return {
        path,
        ...publicProperties(applies),
        writtenAt,
        children: [],
        references: NO_REFERENCES,
        ...(from && { inherited: from }),
        ...(Object.keys(authored).length > 0 && { authored }),
    };
}

function publicProperties({ type, description, deprecated, extensions }: Properties): Written {
    return {
        ...(type !== undefined && type !== "unusable" && { type }),
        ...(description !== undefined && { description }),
        ...(deprecated !== undefined && { deprecated }),
        ...(extensions && { extensions }),
    };
}

function tokenFields(token: MergedToken, now: MadeFrom): Parameters<typeof linkedToken>[0] {
    return {
        path: token.path,
        type: now.type,
        references: NO_REFERENCES,
        writtenAt: now.writtenAt,
        value: now.value,
        resolved: now.resolved,
        invalid: now.invalid,
        description: token.description,
        deprecated: now.deprecated,
        extensions: token.extensions,
        authored: token.added
            ? undefined
            : {
                  value: token.authored,
                  ...publicProperties({ type: token.type, deprecated: token.deprecated }),
              },
        generated: token.generated,
        inherited: token.inherited,
    } as Parameters<typeof linkedToken>[0];
}
