import type {
    Group,
    JsonPath,
    JsonValue,
    Move,
    Permutations,
    Reference,
    ReferenceInPermutations,
    Span,
    Token,
    WrittenReference,
} from "../index.js";
import { movedReference } from "../values/references.js";

export interface ReferenceFacts {
    reference: WrittenReference;
    path: string | undefined;
    span: Span;
    property: JsonPath | undefined;
    targetProperty: JsonPath | undefined;
}

class CurlyBraceReferenceIn {
    declare readonly syntax: "curly-brace";
    readonly path: string;
    readonly from: Token | Group;
    readonly token: Token | undefined;
    readonly span: Span;
    readonly property: JsonPath | undefined;

    constructor(path: string, written: ReferenceFacts, from: Token | Group, token?: Token) {
        this.path = path;
        this.from = from;
        this.token = token;
        this.span = written.span;
        this.property = written.property;
    }

    moved(moves: readonly Move[]): JsonValue {
        return writtenAfter(this, moves, false);
    }

    across(permutations: Permutations): ReferenceAcrossPermutations {
        return new ReferenceAcrossPermutations(this, permutations, false);
    }

    toJSON() {
        const { syntax, path, span, property } = this;
        return { syntax, path, span, property };
    }
}
Object.defineProperty(CurlyBraceReferenceIn.prototype, "syntax", { value: "curly-brace" });

class JsonPointerReferenceIn {
    declare readonly syntax: "json-pointer";
    readonly pointer: string;
    readonly path: string | undefined;
    readonly from: Token | Group;
    readonly token: Token | undefined;
    readonly targetProperty: JsonPath | undefined;
    readonly span: Span;
    readonly property: JsonPath | undefined;
    readonly #pointerAlone: boolean;

    constructor(
        pointer: string,
        written: ReferenceFacts,
        from: Token | Group,
        token: Token | undefined,
        pointerAlone: boolean,
    ) {
        this.pointer = pointer;
        this.path = written.path;
        this.from = from;
        this.token = token;
        this.targetProperty = written.targetProperty;
        this.span = written.span;
        this.property = written.property;
        this.#pointerAlone = pointerAlone;
    }

    moved(moves: readonly Move[]): JsonValue {
        return writtenAfter(this, moves, this.#pointerAlone);
    }

    across(permutations: Permutations): ReferenceAcrossPermutations {
        return new ReferenceAcrossPermutations(this, permutations, this.#pointerAlone);
    }

    toJSON() {
        const { syntax, pointer, span, property } = this;
        return { syntax, pointer, span, property };
    }
}
Object.defineProperty(JsonPointerReferenceIn.prototype, "syntax", { value: "json-pointer" });

type ReferenceIn = CurlyBraceReferenceIn | JsonPointerReferenceIn;

class ReferenceAcrossPermutations {
    readonly syntax: WrittenReference["syntax"];
    readonly path: string | undefined;
    readonly pointer: string | undefined;
    readonly from: string;
    readonly targetProperty: JsonPath | undefined;
    readonly span: Span;
    readonly property: JsonPath | undefined;
    readonly permutations: Permutations;
    readonly #pointerAlone: boolean;

    constructor(reference: ReferenceIn, permutations: Permutations, alone: boolean) {
        this.syntax = reference.syntax;
        this.path = reference.path;
        this.pointer = reference.syntax === "json-pointer" ? reference.pointer : undefined;
        this.from = reference.from.path;
        this.targetProperty =
            reference.syntax === "json-pointer" ? reference.targetProperty : undefined;
        this.span = reference.span;
        this.property = reference.property;
        this.permutations = permutations;
        this.#pointerAlone = alone;
    }

    moved(moves: readonly Move[]): JsonValue {
        return writtenAfter(this, moves, this.#pointerAlone);
    }
}

export function linkedReference(
    written: ReferenceFacts,
    from: Token | Group,
    token: Token | undefined,
    { pointerAlone = false } = {},
): Reference {
    const { reference } = written;
    const made =
        reference.syntax === "curly-brace"
            ? new CurlyBraceReferenceIn(reference.path, written, from, token)
            : new JsonPointerReferenceIn(reference.pointer, written, from, token, pointerAlone);
    return made as unknown as Reference;
}

export function acrossPermutations(
    reference: Reference,
    permutations: Permutations,
): ReferenceInPermutations {
    const across = (reference as unknown as ReferenceIn).across(permutations);
    return across as unknown as ReferenceInPermutations;
}

function writtenAfter(
    reference: { syntax: WrittenReference["syntax"]; path?: string; pointer?: string },
    moves: readonly Move[],
    pointerAlone: boolean,
): JsonValue {
    const written = reference as WrittenReference;
    const now = movedReference(written, moves);
    if (now.syntax === "curly-brace") return `{${now.path}}`;
    return pointerAlone ? now.pointer : { $ref: now.pointer };
}
