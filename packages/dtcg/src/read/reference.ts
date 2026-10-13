import type {
    Group,
    Input,
    JsonPath,
    JsonValue,
    Move,
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

class ReferenceInPermutation {
    readonly syntax: WrittenReference["syntax"];
    readonly path: string | undefined;
    readonly pointer: string | undefined;
    readonly from: Token | Group;
    readonly token: Token | undefined;
    readonly targetProperty: JsonPath | undefined;
    readonly span: Span;
    readonly property: JsonPath | undefined;
    readonly #pointerAlone: boolean;

    constructor(
        written: ReferenceFacts,
        from: Token | Group,
        token: Token | undefined,
        alone: boolean,
    ) {
        const { reference } = written;
        this.syntax = reference.syntax;
        this.path = written.path;
        this.pointer = reference.syntax === "json-pointer" ? reference.pointer : undefined;
        this.from = from;
        this.token = token;
        this.targetProperty = written.targetProperty;
        this.span = written.span;
        this.property = written.property;
        this.#pointerAlone = alone;
    }

    moved(moves: readonly Move[]): JsonValue {
        return writtenAfter(this, moves, this.#pointerAlone);
    }

    across(input: Input): ReferenceAcrossPermutations {
        return new ReferenceAcrossPermutations(this, input, this.#pointerAlone);
    }

    toJSON() {
        const { syntax, path, pointer, span, property } = this;
        return { syntax, path: pointer === undefined ? path : undefined, pointer, span, property };
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
    readonly permutations: Input[];
    readonly #pointerAlone: boolean;

    constructor(reference: ReferenceInPermutation, input: Input, alone: boolean) {
        this.syntax = reference.syntax;
        this.path = reference.path;
        this.pointer = reference.pointer;
        this.from = reference.from.path;
        this.targetProperty = reference.targetProperty;
        this.span = reference.span;
        this.property = reference.property;
        this.permutations = [input];
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
    return new ReferenceInPermutation(written, from, token, pointerAlone) as unknown as Reference;
}

export function acrossPermutations(reference: Reference, input: Input): ReferenceInPermutations {
    const across = (reference as unknown as ReferenceInPermutation).across(input);
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
