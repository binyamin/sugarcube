import type {
    CurlyBraceReference,
    JsonPointerReference,
    Move,
    WrittenReference,
} from "../index.js";
import { movedPath } from "../path.js";
import { encodePointer, refSteps } from "../read/pointer.js";
import { pointerParts } from "../read/ref-meaning.js";
import { isJsonObject } from "./json.js";

/**
 * A reference to a whole token: a token path between curly braces, such as `"{color.brand}"`.
 * Names cannot contain `{`, `}` or `.` (Format 5.1.1), so the path is anything but a brace, and is
 * split on `.` afterwards. Spaces and `$root` are allowed, as they are in names.
 */
const CURLY_BRACE = /^\{([^{}]+)\}$/;

export function readCurlyBrace(raw: unknown): CurlyBraceReference | undefined {
    if (typeof raw !== "string") return undefined;

    const path = CURLY_BRACE.exec(raw)?.[1];
    if (path === undefined || path.split(".").some((segment) => segment === "")) return undefined;
    return { syntax: "curly-brace", path };
}

export function readJsonPointer(raw: unknown): JsonPointerReference | undefined {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;

    const keys = Object.keys(raw);
    const ref = (raw as { $ref?: unknown }).$ref;
    if (keys.length !== 1 || typeof ref !== "string") return undefined;
    return { syntax: "json-pointer", pointer: ref };
}

/**
 * Which reference a value is, as written in a file: `"{color.brand}"` in curly brace syntax
 * (Format 7.1.1), `{ "$ref": "#/color/brand" }` in JSON Pointer syntax (Format 7.1.2). Anything
 * else is not a reference, and gives `undefined`.
 *
 * @example
 * readReference("{color.brand}") // { syntax: "curly-brace", path: "color.brand" }
 */
export function readReference(raw: unknown): WrittenReference | undefined {
    return readCurlyBrace(raw) ?? readJsonPointer(raw);
}

/**
 * Whether a value from the model is a reference, in either syntax, as a parser reads it: a
 * {@link WrittenReference}, or a token's {@link Reference}. Not for JSON as written in a file.
 *
 * @example
 * if (isReference(token.value)) token.value.syntax
 */
export function isReference(value: unknown): value is WrittenReference {
    if (!isJsonObject(value)) return false;
    if (value.syntax === "curly-brace") return typeof value.path === "string";
    return value.syntax === "json-pointer" && typeof value.pointer === "string";
}

export function referenceText(reference: WrittenReference): string {
    return reference.syntax === "curly-brace" ? reference.path : reference.pointer;
}

export function movedReference<R extends WrittenReference>(ref: R, moved: readonly Move[]): R;
export function movedReference(ref: WrittenReference, moved: readonly Move[]): WrittenReference {
    if (ref.syntax === "curly-brace") {
        return { syntax: "curly-brace", path: movedPath(ref.path, moved) };
    }
    const steps = refSteps(ref.pointer);
    if (!steps) return ref;
    const { path, inside } = pointerParts(steps);
    if (path === undefined) return ref;
    const now = movedPath(path, moved);
    if (now === path) return ref;
    const pointer = encodePointer([...now.split("."), ...(inside ? ["$value", ...inside] : [])]);
    return { syntax: "json-pointer", pointer };
}
