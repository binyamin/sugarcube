import type { Node } from "jsonc-parser";
import type {
    Diagnostic,
    IgnoredProperty,
    Input,
    ParseOptions,
    ParseResult,
    TokenType,
    UnresolvedValueByType,
    ValueError,
} from "../index.js";
import type { DiagnosticExtra } from "./diagnostics.js";
import { ignoredDiagnostic, valueDiagnostic } from "./value-diagnostic.js";
import {
    type Notes,
    type Slot,
    type ReadAgain,
    type ReferenceRead,
    readSlot,
    readToken,
} from "../values/read-syntax.js";
import { deepestNode, spanOf } from "./json.js";
import type { MergedToken } from "./merge.js";
import { type Occurrence, occurrence } from "./occurrence.js";

export interface LocatedReference {
    reference: ReferenceRead;
    occurrence: Occurrence;
}

export interface ValueRead<V = unknown> {
    result: ParseResult<V>;
    references: LocatedReference[];
    readAgain: ReadAgain[];
}

type Read = <T extends TokenType>(
    token: MergedToken,
    type: T,
) => ValueRead<UnresolvedValueByType[T]>;

export interface ValueReader {
    read: Read;
    readTarget: (
        token: MergedToken,
        slot: Slot,
        raw: unknown,
        permutation: Input,
    ) => { result: ParseResult<unknown>; notes: Notes };
}

type Cache = { [T in TokenType]?: Map<Node, ValueRead<UnresolvedValueByType[T]>> };

export function createValueReader(diagnostics: Diagnostic[], options: ParseOptions): ValueReader {
    const caches: Cache = {};

    const read: Read = (token, type) => {
        const notes: Notes = { references: [], readAgain: [] };
        const result = readToken(type, token.authored, ["$value"], options, notes);
        for (const each of result.ignored) diagnostics.push(ignoredToDiagnostic(token, each));
        if (!result.ok) {
            for (const error of result.errors) diagnostics.push(toDiagnostic(token, error));
        }
        const references = notes.references.map((reference) => ({
            reference,
            occurrence: occurrence(token, reference),
        }));
        return { result, references, readAgain: notes.readAgain };
    };

    return {
        read: (token, type) => {
            if (token.added) return read(token, type);
            const cache: NonNullable<Cache[typeof type]> = caches[type] ?? new Map();
            caches[type] = cache;
            const cached = cache.get(token.value);
            if (cached) return cached;
            const fresh = read(token, type);
            cache.set(token.value, fresh);
            return fresh;
        },
        readTarget: (token, slot, raw, permutation) => {
            const notes: Notes = { references: [], readAgain: [] };
            const result = readSlot(slot, raw, options, notes);
            if (!result.ok) {
                for (const error of result.errors) {
                    diagnostics.push(toDiagnostic(token, error, permutation));
                }
            }
            return { result, notes };
        },
    };
}

function ignoredToDiagnostic(token: MergedToken, ignored: IgnoredProperty): Diagnostic {
    const { json, value, path } = token;
    const within = { node: value, steps: ignored.jsonPath.slice(1), json };
    return ignoredDiagnostic(ignored, ignored.jsonPath, within, { path });
}

function toDiagnostic(token: MergedToken, error: ValueError, permutation?: Input): Diagnostic {
    const { json, value, path } = token;
    const node = deepestNode(value, error.jsonPath.slice(1));
    const span = spanOf(json, node);
    const extra: DiagnosticExtra = {
        span,
        path,
        ...(permutation !== undefined && { permutation }),
    };
    return valueDiagnostic(error.detail, error.jsonPath, node, extra);
}
