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

class ReferenceObject {
    declare readonly pointer?: string;
    declare readonly targetProperty?: JsonPath | undefined;
    readonly path: string | undefined;
    readonly from: Token | Group;
    readonly token: Token | undefined;
    readonly property: JsonPath | undefined;
    readonly #written: WrittenReference;
    readonly #span: Span;
    readonly #pointerAlone: boolean;

    constructor(
        facts: ReferenceFacts,
        from: Token | Group,
        token: Token | undefined,
        pointerAlone: boolean,
    ) {
        const { reference } = facts;
        this.path = facts.path;
        this.from = from;
        this.token = token;
        this.property = facts.property;
        if (reference.syntax === "json-pointer") {
            Object.assign(this, {
                pointer: reference.pointer,
                targetProperty: facts.targetProperty,
            });
        }
        this.#written = reference;
        this.#span = facts.span;
        this.#pointerAlone = pointerAlone;
    }

    get syntax(): WrittenReference["syntax"] {
        return this.#written.syntax;
    }

    static spanOf(reference: ReferenceObject): Span {
        return reference.#span;
    }

    moved(moves: readonly Move[]): JsonValue {
        return writtenAfter(this.#written, moves, this.#pointerAlone);
    }

    across(permutations: Permutations, span: Span): ReferenceAcrossPermutations {
        return new ReferenceAcrossPermutations(
            this,
            this.#written,
            permutations,
            span,
            this.#pointerAlone,
        );
    }

    toJSON() {
        const { syntax, path, property } = this;
        const written = this.#written;
        return written.syntax === "curly-brace"
            ? { syntax, path, property }
            : { syntax, pointer: written.pointer, property };
    }
}

class ReferenceAcrossPermutations {
    readonly syntax: WrittenReference["syntax"];
    readonly path: string | undefined;
    readonly pointer: string | undefined;
    readonly from: string;
    readonly targetProperty: JsonPath | undefined;
    readonly span: Span;
    readonly property: JsonPath | undefined;
    readonly permutations: Permutations;
    readonly #written: WrittenReference;
    readonly #pointerAlone: boolean;

    constructor(
        reference: ReferenceObject,
        written: WrittenReference,
        permutations: Permutations,
        span: Span,
        alone: boolean,
    ) {
        this.syntax = written.syntax;
        this.path = reference.path;
        this.pointer = written.syntax === "json-pointer" ? written.pointer : undefined;
        this.from = reference.from.path;
        this.targetProperty = reference.targetProperty;
        this.span = span;
        this.property = reference.property;
        this.permutations = permutations;
        this.#written = written;
        this.#pointerAlone = alone;
    }

    moved(moves: readonly Move[]): JsonValue {
        return writtenAfter(this.#written, moves, this.#pointerAlone);
    }
}

export function linkedReference(
    written: ReferenceFacts,
    from: Token | Group,
    token: Token | undefined,
    { pointerAlone = false } = {},
): Reference {
    return new ReferenceObject(written, from, token, pointerAlone) as unknown as Reference;
}

export function spanOfReference(reference: Reference): Span {
    return ReferenceObject.spanOf(reference as unknown as ReferenceObject);
}

export function acrossPermutations(
    reference: Reference,
    permutations: Permutations,
    span: Span,
): ReferenceInPermutations {
    const across = (reference as unknown as ReferenceObject).across(permutations, span);
    return across as unknown as ReferenceInPermutations;
}

function writtenAfter(
    written: WrittenReference,
    moves: readonly Move[],
    pointerAlone: boolean,
): JsonValue {
    const now = movedReference(written, moves);
    if (now.syntax === "curly-brace") return `{${now.path}}`;
    return pointerAlone ? now.pointer : { $ref: now.pointer };
}
