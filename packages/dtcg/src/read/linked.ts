import type {
    Document,
    Group,
    JsonPath,
    Permutation,
    Reference,
    ReferenceOptions,
    Token,
} from "../index.js";
import { referencedByIn, referencedIn, referencesIn } from "../lookup/references.js";

export const NO_REFERENCES: Reference[] = Object.freeze([]) as unknown as Reference[];

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
        for (let at: Token | undefined = this as unknown as Token; at && !chain.includes(at);) {
            chain.push(at);
            at = at.referenceAt()?.token;
        }
        return chain;
    },
    toJSON(this: Token) {
        return { ...this, group: undefined, permutation: undefined };
    },
};

const groupShared = {
    kind: "group",
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

const permutationShared = {
    toJSON(this: Permutation) {
        return { ...this, children: paths(this.children) };
    },
};

const documentShared = {
    references(this: Document, path: string, options?: ReferenceOptions) {
        return referencesIn(this, path, options);
    },
    referencedBy(this: Document, path: string, options?: ReferenceOptions) {
        return referencedByIn(this, path, options);
    },
};

type TokenFields = Omit<Token, "kind" | "referenceAt" | "referencedBy" | "aliasChain">;

function TokenObject(this: Record<string, unknown>, fields: TokenFields): void {
    this.path = fields.path;
    this.type = fields.type;
    this.group = fields.group;
    this.permutation = fields.permutation;
    this.references = fields.references;
    this.source = fields.source;
    if (fields.value !== undefined) this.value = fields.value;
    if (fields.resolved !== undefined) this.resolved = fields.resolved;
    if (fields.invalid) this.invalid = fields.invalid;
    if (fields.description !== undefined) this.description = fields.description;
    if (fields.deprecated !== undefined) this.deprecated = fields.deprecated;
    if (fields.extensions) this.extensions = fields.extensions;
    if (fields.replaces) this.replaces = fields.replaces;
    if (fields.authored) this.authored = fields.authored;
    if (fields.generated) this.generated = fields.generated;
    if (fields.inherited) this.inherited = fields.inherited;
}
TokenObject.prototype = tokenShared;

export function linkedToken(fields: TokenFields): Token {
    return new (TokenObject as unknown as new (fields: TokenFields) => Token)(fields);
}

export function linkedGroup(fields: Omit<Group, "kind">): Group {
    return Object.assign(Object.create(groupShared), fields);
}

export function linkedPermutation(fields: Permutation): Permutation {
    return Object.assign(Object.create(permutationShared), fields);
}

export function linkedDocument(fields: Omit<Document, "references" | "referencedBy">): Document {
    return Object.assign(Object.create(documentShared), fields);
}

function paths(items: (Token | Group)[]): string[] {
    return items.map(({ path }) => path);
}

function samePlace(a: JsonPath | undefined, b: JsonPath): boolean {
    if (a === undefined) return b.length === 0;
    return a.length === b.length && a.every((step, index) => step === b[index]);
}
