import type { JsonPath, Span, WrittenReference } from "../index.js";
import type { ReferenceRead } from "../values/read-syntax.js";
import { deepestNode, spanOf } from "./json.js";
import type { MergedToken } from "./merge.js";
import { refSteps } from "./pointer.js";

export interface Occurrence {
    reference: WrittenReference;
    steps: string[] | undefined;
    place: JsonPath;
    at: Span;
}

export function occurrence(
    token: MergedToken,
    { ref, place, at }: Pick<ReferenceRead, "ref" | "place" | "at">,
): Occurrence {
    const { json, value } = token;
    const node = deepestNode(value, at.slice(1));
    const span = spanOf(json.path, json.lineStarts, node.offset, node.length);
    const steps = ref.syntax === "json-pointer" ? refSteps(ref.pointer) : undefined;
    return { reference: ref, steps, place, at: span };
}

export function wholeReference(token: MergedToken): Occurrence | undefined {
    const { reference } = token;
    return reference && occurrence(token, { ref: reference, place: [], at: ["$value"] });
}
