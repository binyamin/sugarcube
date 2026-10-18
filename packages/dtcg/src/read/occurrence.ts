import type { JsonPath, Span } from "../index.js";
import type { ReferenceRead } from "../values/read-syntax.js";
import { deepestNode, spanOf } from "./json.js";
import type { MergedToken } from "./merge.js";
import { type Aim, aimOf } from "./ref-meaning.js";

export interface Occurrence extends Aim {
    property: JsonPath;
    span: Span;
}

export function occurrence(
    token: MergedToken,
    { ref, property, jsonPath }: Pick<ReferenceRead, "ref" | "property" | "jsonPath">,
): Occurrence {
    const { json, value } = token;
    const node = deepestNode(value, jsonPath.slice(1));
    const span = spanOf(json, node);
    return { ...aimOf(ref), property, span };
}

export function wholeReference(token: MergedToken): Occurrence | undefined {
    const { reference } = token;
    return reference && occurrence(token, { ref: reference, property: [], jsonPath: ["$value"] });
}
