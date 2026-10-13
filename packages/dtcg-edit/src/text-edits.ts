import type { JsonPath } from "@sugarcube-sh/dtcg";
import { type Node, findNodeAtLocation, getNodeValue, parseTree } from "jsonc-parser";
import type { Json } from "./index.js";
import { type Splice, insertion, removal, replacement, spliced } from "./json-text.js";

/**
 * Sets a value in JSON text, changing nothing else: every other line is left as written. Groups
 * missing on the way are made. A value replacing one written on one line is written on one line;
 * a new member is written in the style of the sibling before it, on one line or spread over
 * several in the file's own indent.
 *
 * @returns the new text, or `undefined` when `jsonPath` runs through something that isn't a group,
 * or past the end of a list
 */
export function setAt(text: string, jsonPath: JsonPath, value: Json): string | undefined {
    const root = parseTree(text);
    const splices = root && setSplices(text, root, jsonPath, value);
    return splices && spliced(text, splices);
}

export function setSplices(
    text: string,
    root: Node,
    jsonPath: JsonPath,
    value: Json,
): Splice[] | undefined {
    let node = root;
    for (const [index, step] of jsonPath.entries()) {
        const child = findNodeAtLocation(node, [step]);
        if (child) {
            node = child;
            continue;
        }
        const missing = jsonPath.slice(index);
        if (node.type !== "object" || missing.some((each) => typeof each !== "string")) {
            return undefined;
        }
        const [key, ...inner] = missing as string[];
        const nested = inner.reduceRight<Json>((acc, each) => ({ [each]: acc }), value);
        return insertion(text, node, key as string, nested);
    }
    return [replacement(text, node, value)];
}

/**
 * Removes a value from JSON text, changing nothing else: a member written on its own lines goes
 * with its lines, and a group left empty is written `{}`.
 *
 * @returns the new text, or the same text when nothing is at `jsonPath`
 */
export function removeAt(text: string, jsonPath: JsonPath): string {
    const node = find(text, jsonPath);
    return node ? spliced(text, removal(text, node)) : text;
}

/**
 * Renames a key in JSON text, keeping its value and position.
 *
 * @returns the new text, or `undefined` when nothing is at `jsonPath` or a sibling already has the
 * name
 */
export function renameKeyAt(text: string, jsonPath: JsonPath, name: string): string | undefined {
    const node = find(text, jsonPath);
    const splices = node && renameSplices(node, name);
    return splices && spliced(text, splices);
}

export function renameSplices(node: Node, name: string): Splice[] | undefined {
    const property = node.parent;
    const key = property?.type === "property" ? property.children?.[0] : undefined;
    if (!property || !key) return undefined;
    const siblings = property.parent?.children ?? [];
    if (siblings.some((each) => each !== property && each.children?.[0]?.value === name)) {
        return undefined;
    }
    return [{ offset: key.offset, length: key.length, text: JSON.stringify(name) }];
}

export function valueAt(text: string, jsonPath: JsonPath): Json | undefined {
    const node = find(text, jsonPath);
    return node === undefined ? undefined : (getNodeValue(node) as Json);
}

function find(text: string, jsonPath: JsonPath): Node | undefined {
    const root = parseTree(text);
    return root === undefined ? undefined : findNodeAtLocation(root, jsonPath);
}
