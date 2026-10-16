import type {
    DesignTokens,
    Diagnostic,
    Group,
    Input,
    JsonPath,
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
import { diagnosticsAtIn, diagnosticsForIn, diagnosticsOf } from "../lookup/diagnostics.js";
import { diffIn } from "../lookup/diff.js";
import { partsOf } from "../lookup/parts.js";
import { modifierIn, permutationIn } from "../lookup/permutation.js";
import { referencedByIn, referencedIn, referencesIn } from "../lookup/references.js";
import { resolvedValuesIn } from "../lookup/resolved-values.js";
import { writtenAtIn } from "../lookup/written-at.js";
import { type Kept, keep, keptBy } from "./kept.js";

export const NO_REFERENCES: Reference[] = Object.freeze([]) as unknown as Reference[];
export const NO_PLACES: Place[] = Object.freeze([]) as unknown as Place[];

const designTokensOf = new WeakMap<Permutation, DesignTokens>();

const tokenShared = {
    kind: "token",
    referenceAt(this: Token, property: JsonPath = []): Reference | undefined {
        return this.references.find((each) => samePlace(each.property, property));
    },
    referencedBy(this: Token, options?: ReferenceOptions): Reference[] {
        return referencedIn(this.permutation, this.path, options);
    },
    get aliasChain(): Token[] {
        const chain: Token[] = [];
        for (
            let current: Token | undefined = this as unknown as Token;
            current && !chain.includes(current);
        ) {
            chain.push(current);
            current = current.referenceAt()?.token;
        }
        return chain;
    },
    get valueFrom(): Place {
        const { writtenAt } = this as unknown as Token;
        return writtenAt[writtenAt.length - 1] as Place;
    },
    get parts(): Part | undefined {
        return partsOf(this as unknown as Token);
    },
    get diagnostics(): Diagnostic[] {
        const token = this as unknown as Token;
        return diagnosticsOf(designTokensOf.get(token.permutation) as DesignTokens, token);
    },
    toJSON(this: Token) {
        return { ...this, group: undefined, permutation: undefined };
    },
};

const groupShared = {
    kind: "group",
    get tokens(): Token[] {
        const found: Token[] = [];
        const visit = (items: (Token | Group)[]) => {
            for (const each of items) {
                if (each.kind === "token") found.push(each);
                else visit(each.children);
            }
        };
        visit((this as unknown as Group).children);
        return found;
    },
    toJSON(this: Group) {
        return {
            ...this,
            group: undefined,
            extends: undefined,
            rootToken: undefined,
            children: paths(this.children),
        };
    },
};

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

type TokenFields = Omit<Token, keyof typeof tokenShared>;

function TokenObject(this: Record<string, unknown>, fields: TokenFields): void {
    this.path = fields.path;
    this.type = fields.type;
    this.group = fields.group;
    this.permutation = fields.permutation;
    this.references = fields.references;
    this.writtenAt = fields.writtenAt;
    if (fields.value !== undefined) this.value = fields.value;
    if (fields.resolved !== undefined) this.resolved = fields.resolved;
    if (fields.invalid) this.invalid = fields.invalid;
    if (fields.description !== undefined) this.description = fields.description;
    if (fields.deprecated !== undefined) this.deprecated = fields.deprecated;
    if (fields.extensions) this.extensions = fields.extensions;
    if (fields.authored) this.authored = fields.authored;
    if (fields.generated) this.generated = fields.generated;
    if (fields.inherited) this.inherited = fields.inherited;
}
TokenObject.prototype = tokenShared;

export function linkedToken(fields: TokenFields): Token {
    return new (TokenObject as unknown as new (fields: TokenFields) => Token)(fields);
}

export function linkedGroup(fields: Omit<Group, keyof typeof groupShared>): Group {
    return Object.assign(Object.create(groupShared), fields);
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

    constructor(source: Source, span: Span) {
        this.source = source;
        this.span = span;
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

export function placesIn(): Places {
    const made = new Map<Span, PlaceObject[]>();
    const at = (source: Source, span: Span): PlaceObject => {
        const atSpan = made.get(span);
        const found = atSpan?.find((each) => each.source === source);
        if (found) return found;
        const place = new PlaceObject(source, span);
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

function paths(items: (Token | Group)[]): string[] {
    return items.map(({ path }) => path);
}

function samePlace(a: JsonPath | undefined, b: JsonPath): boolean {
    if (a === undefined) return b.length === 0;
    return a.length === b.length && a.every((step, index) => step === b[index]);
}
