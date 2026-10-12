import type { JsonPath, Project, Span } from "@sugarcube-sh/dtcg";
import {
    type Node,
    findNodeAtLocation,
    findNodeAtOffset,
    getNodePath,
    getNodeValue,
    parseTree,
} from "jsonc-parser";
import type { Json } from "./index.js";

export interface Place {
    span: Span;
    path: JsonPath;
    written: Json;
}

const parsed = new WeakMap<Project["files"], Map<string, Node | undefined>>();

function treeOf(project: Project, file: string): Node | undefined {
    const trees = parsed.get(project.files) ?? new Map<string, Node | undefined>();
    parsed.set(project.files, trees);
    if (!trees.has(file)) {
        const text = project.files[file];
        trees.set(file, text === undefined ? undefined : parseTree(text));
    }
    return trees.get(file);
}

export function nodeAt(project: Project, { file, offset, length }: Span): Node | undefined {
    const tree = treeOf(project, file);
    let node = tree && findNodeAtOffset(tree, offset);
    while (node && (node.offset !== offset || node.length !== length)) node = node.parent;
    return node;
}

export function writtenAt(project: Project, file: string, path: JsonPath): Json | undefined {
    const tree = treeOf(project, file);
    const node = tree && findNodeAtLocation(tree, path);
    return node && (getNodeValue(node) as Json);
}

export function placeOf(project: Project, span: Span): Place | undefined {
    const node = nodeAt(project, span);
    return node && { span, path: getNodePath(node), written: getNodeValue(node) as Json };
}

export function spanKey({ file, offset }: Span): string {
    return `${file}:${offset}`;
}

export function unique(spans: Span[]): Span[] {
    const seen = new Set<string>();
    return spans.filter((span) => {
        const key = spanKey(span);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}
