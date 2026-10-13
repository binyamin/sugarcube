import type { DesignSystem, JsonPath, Span } from "@sugarcube-sh/dtcg";
import {
    type Node,
    findNodeAtLocation,
    findNodeAtOffset,
    getNodePath,
    getNodeValue,
    parseTree,
} from "jsonc-parser";
import type { Json } from "./index.js";

export interface Member {
    span: Span;
    jsonPath: JsonPath;
    written: Json;
}

const parsed = new WeakMap<DesignSystem, Map<string, Node | undefined>>();

function treeOf(ds: DesignSystem, file: string): Node | undefined {
    const trees = parsed.get(ds) ?? new Map<string, Node | undefined>();
    parsed.set(ds, trees);
    if (!trees.has(file)) {
        const text = ds.text(file);
        trees.set(file, text === undefined ? undefined : parseTree(text));
    }
    return trees.get(file);
}

export function nodeAt(ds: DesignSystem, { file, offset, length }: Span): Node | undefined {
    const tree = treeOf(ds, file);
    let node = tree && findNodeAtOffset(tree, offset);
    while (node && (node.offset !== offset || node.length !== length)) node = node.parent;
    return node;
}

export function writtenIn(ds: DesignSystem, file: string, jsonPath: JsonPath): Json | undefined {
    const tree = treeOf(ds, file);
    const node = tree && findNodeAtLocation(tree, jsonPath);
    return node && (getNodeValue(node) as Json);
}

export function memberAt(ds: DesignSystem, span: Span): Member | undefined {
    const node = nodeAt(ds, span);
    return node && { span, jsonPath: getNodePath(node), written: getNodeValue(node) as Json };
}

export function spanKey({ file, offset }: Span): string {
    return `${file}:${offset}`;
}
