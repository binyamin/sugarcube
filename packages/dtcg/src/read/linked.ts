import { parse } from "jsonc-parser";
import type {
    DesignTokens,
    Diagnostic,
    Group,
    Input,
    JsonPath,
    JsonValue,
    Move,
    Part,
    Permutation,
    Place,
    Reference,
    ReferenceOptions,
    ResolverContext,
    ResolverModifier,
    Source,
    Span,
    Token,
} from "../index.js";
import { diagnosticsAtIn, diagnosticsForIn, diagnosticsIn } from "../lookup/diagnostics.js";
import { diffIn } from "../lookup/diff.js";
import { partsOf } from "../lookup/parts.js";
import { modifierIn, permutationIn } from "../lookup/permutation.js";
import {
    referencedByIn,
    referencedIn,
    referencesIn,
    usedByIn,
    usedIn,
} from "../lookup/references.js";
import { resolvedValuesIn } from "../lookup/resolved-values.js";
import { writtenAtIn } from "../lookup/written-at.js";
import { type Kept, keep, keptBy } from "./kept.js";

export const NO_REFERENCES: Reference[] = Object.freeze([]) as unknown as Reference[];
export const NO_PLACES: Place[] = Object.freeze([]) as unknown as Place[];

const designTokensOf = new WeakMap<Permutation, DesignTokens>();

const NOT_YET = Symbol("not yet worked out");

type TokenFields = Omit<Token, "kind" | "referenceAt" | "aliasChain" | "valueFrom" | "parts">;

type GroupFields = Omit<Group, "kind" | "childTokens" | "tokens">;

class TokenObject {
    #aliasChain: readonly Token[] | undefined;
    #parts: Part | undefined | typeof NOT_YET = NOT_YET;

    constructor(fields: TokenFields) {
        const self = this as unknown as Record<string, unknown>;
        self.path = fields.path;
        self.type = fields.type;
        self.references = fields.references;
        self.writtenAt = fields.writtenAt;
        if (fields.value !== undefined) self.value = fields.value;
        if (fields.resolved !== undefined) self.resolved = fields.resolved;
        if (fields.invalid) self.invalid = fields.invalid;
        if (fields.description !== undefined) self.description = fields.description;
        if (fields.deprecated !== undefined) self.deprecated = fields.deprecated;
        if (fields.extensions) self.extensions = fields.extensions;
        if (fields.authored) self.authored = fields.authored;
        if (fields.generated) self.generated = fields.generated;
        if (fields.inherited) self.inherited = fields.inherited;
    }

    referenceAt(property: JsonPath = []): Reference | undefined {
        return (this as unknown as Token).references.find((each) =>
            samePlace(each.property, property),
        );
    }

    get aliasChain(): readonly Token[] {
        this.#aliasChain ??= aliasChainOf(this as unknown as Token);
        return this.#aliasChain;
    }

    get valueFrom(): Place {
        const { writtenAt } = this as unknown as Token;
        return writtenAt[writtenAt.length - 1] as Place;
    }

    get parts(): Part | undefined {
        if (this.#parts === NOT_YET) this.#parts = partsOf(this as unknown as Token);
        return this.#parts;
    }
}
Object.defineProperty(TokenObject.prototype, "kind", { value: "token" });

class GroupObject {
    #childTokens: readonly Token[] | undefined;
    #tokens: readonly Token[] | undefined;

    constructor(fields: GroupFields) {
        Object.assign(this, fields);
    }

    get childTokens(): readonly Token[] {
        this.#childTokens ??= (this as unknown as Group).children.filter(
            (child): child is Token => child.kind === "token",
        );
        return this.#childTokens;
    }

    get tokens(): readonly Token[] {
        this.#tokens ??= tokensIn((this as unknown as Group).children);
        return this.#tokens;
    }

    toJSON() {
        const group = this as unknown as Group;
        return {
            ...group,
            extends: undefined,
            rootToken: undefined,
            children: paths(group.children),
        };
    }
}
Object.defineProperty(GroupObject.prototype, "kind", { value: "group" });

function aliasChainOf(token: Token): Token[] {
    const chain: Token[] = [];
    for (let current: Token | undefined = token; current;) {
        if (chain.includes(current)) break;
        chain.push(current);
        current = current.referenceAt()?.token;
    }
    return chain;
}

export function tokensIn(children: readonly (Token | Group)[], found: Token[] = []): Token[] {
    for (const child of children) {
        if (child.kind === "token") found.push(child);
        else tokensIn(child.children, found);
    }
    return found;
}

interface Index {
    tokens: Map<string, Token>;
    groups: Map<string, Group>;
}

const indexes = new WeakMap<Permutation, Index>();

const permutationShared = {
    get isDefault(): boolean {
        return (this as unknown as Permutation).contexts.every((context) => context.isDefault);
    },
    token(this: Permutation, path: string): Token | undefined {
        return indexes.get(this)?.tokens.get(path);
    },
    group(this: Permutation, path: string): Group | undefined {
        return indexes.get(this)?.groups.get(path);
    },
    referencedBy(this: Permutation, path: string, options?: ReferenceOptions): Reference[] {
        return referencedIn(this, path, options);
    },
    usedBy(this: Permutation, path: string, options?: ReferenceOptions): (Token | Group)[] {
        return usedIn(this, path, options);
    },
    diagnosticsFor(this: Permutation, path: string): Diagnostic[] {
        return diagnosticsIn(designTokensOf.get(this) as DesignTokens, this, path);
    },
    toJSON(this: Permutation) {
        const sources = this.sources.map(positionOf);
        return { ...this, contexts: undefined, sources, children: paths(this.children) };
    },
};

const modifierShared = {
    toJSON(this: ResolverModifier) {
        const contexts = this.contexts.map(({ name, sources, span }) => ({ name, sources, span }));
        return { ...this, contexts };
    },
};

const contextShared = {
    toJSON(this: ResolverContext) {
        return { modifier: this.modifier.name, name: this.name };
    },
};

const designTokensShared = {
    references(this: DesignTokens, path: string, options?: ReferenceOptions) {
        return referencesIn(this, path, options);
    },
    referencedBy(this: DesignTokens, path: string, options?: ReferenceOptions) {
        return referencedByIn(this, path, options);
    },
    usedBy(this: DesignTokens, path: string, options?: ReferenceOptions) {
        return usedByIn(this, path, options);
    },
    writtenAt(this: DesignTokens, path: string) {
        return writtenAtIn(this, path);
    },
    resolvedValues(this: DesignTokens, path: string) {
        return resolvedValuesIn(this, path);
    },
    permutation(this: DesignTokens, input?: Input) {
        return permutationIn(this, input);
    },
    modifier(this: DesignTokens, name: string) {
        return modifierIn(this, name);
    },
    tokenPaths(this: DesignTokens) {
        return pathsIn(this, "tokens");
    },
    groupPaths(this: DesignTokens) {
        return pathsIn(this, "groups");
    },
    toJSON(this: DesignTokens) {
        return { ...this, permutations: [...this.permutations] };
    },
    diagnosticsFor(this: DesignTokens, path: string) {
        return diagnosticsForIn(this, path);
    },
    diagnosticsAt(this: DesignTokens, place: Pick<Span, "file" | "offset" | "length">) {
        return diagnosticsAtIn(this, place);
    },
    diff(this: DesignTokens, before: DesignTokens, options?: { moved?: Move[] }) {
        return diffIn(this, before, options);
    },
    text(this: DesignTokens, file: string): string | undefined {
        return keptBy(this).texts[file];
    },
    reread(this: DesignTokens, changed: Readonly<Record<string, string | null>>) {
        const { texts, readFiles } = keptBy(this);
        const files: Record<string, string> = { ...texts };
        for (const [file, text] of Object.entries(changed)) {
            if (text === null) delete files[file];
            else files[file] = text;
        }
        return readFiles(files);
    },
    toMemory(this: DesignTokens) {
        return { entry: this.entry, files: { ...keptBy(this).texts } };
    },
    has(this: DesignTokens, path: string) {
        return this.permutations.some(
            (each) => (each.token(path) ?? each.group(path)) !== undefined,
        );
    },
};

export function linkedToken(fields: TokenFields): Token {
    return new TokenObject(fields) as unknown as Token;
}

export function linkedGroup(fields: GroupFields): Group {
    return new GroupObject(fields) as unknown as Group;
}

export function linkedPermutation(
    fields: Omit<Permutation, keyof typeof permutationShared>,
): Permutation {
    return Object.assign(Object.create(permutationShared), fields);
}

export function withIndex(
    permutation: Permutation,
    tokens: Map<string, Token>,
    groups: Map<string, Group>,
): void {
    indexes.set(permutation, { tokens, groups });
}

export function linkedModifier(fields: ResolverModifier): ResolverModifier {
    return Object.assign(Object.create(modifierShared), fields);
}

export function linkedContext(fields: ResolverContext): ResolverContext {
    return Object.assign(Object.create(contextShared), fields);
}

const positions = new WeakMap<Source, number>();

export function withPosition(fields: Source, position: number): Source {
    positions.set(fields, position);
    return fields;
}

function positionOf(source: Source): number | undefined {
    return positions.get(source);
}

class PlaceObject {
    readonly source: Source;
    readonly span: Span;
    #alone: Place[] | undefined;
    #texts: Readonly<Record<string, string>>;
    #written: JsonValue | undefined;

    constructor(source: Source, span: Span, texts: Readonly<Record<string, string>>) {
        this.source = source;
        this.span = span;
        this.#texts = texts;
    }

    get written(): JsonValue {
        const { file, offset, length } = this.span;
        this.#written ??= parse(
            this.#texts[file]?.slice(offset, offset + length) ?? "null",
        ) as JsonValue;
        return this.#written;
    }

    static alone(place: PlaceObject): Place[] {
        place.#alone ??= [place];
        return place.#alone;
    }

    toJSON() {
        return { source: positionOf(this.source), span: this.span };
    }
}

export interface Places {
    at(source: Source, span: Span): Place;
    only(source: Source, span: Span): Place[];
}

export function placesIn(texts: Readonly<Record<string, string>>): Places {
    const made = new Map<Span, PlaceObject[]>();
    const at = (source: Source, span: Span): PlaceObject => {
        const atSpan = made.get(span);
        const found = atSpan?.find((each) => each.source === source);
        if (found) return found;
        const place = new PlaceObject(source, span, texts);
        if (atSpan) atSpan.push(place);
        else made.set(span, [place]);
        return place;
    };
    return { at, only: (source, span) => PlaceObject.alone(at(source, span)) };
}

export function linkedDesignTokens(
    fields: Omit<DesignTokens, keyof typeof designTokensShared>,
    beside: Kept,
): DesignTokens {
    const tokens: DesignTokens = Object.assign(Object.create(designTokensShared), fields);
    keep(tokens, beside);
    for (const permutation of tokens.permutations) designTokensOf.set(permutation, tokens);
    return tokens;
}

function pathsIn(tokens: DesignTokens, kind: "tokens" | "groups"): string[] {
    const found = new Set<string>();
    for (const permutation of tokens.permutations) {
        for (const { path } of permutation[kind]) found.add(path);
    }
    return [...found];
}

function paths(items: readonly (Token | Group)[]): string[] {
    return items.map(({ path }) => path);
}

function samePlace(a: JsonPath | undefined, b: JsonPath): boolean {
    if (a === undefined) return b.length === 0;
    return a.length === b.length && a.every((step, index) => step === b[index]);
}
