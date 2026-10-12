// A sidebar tree of groups and tokens, nested, in the order the files list them.
import { defaultPermutation, group, type Document, type Permutation } from "@sugarcube-sh/dtcg";

declare const doc: Document;

type Node = { path: string; token: boolean; children: Node[] };

function node(p: Permutation, path: string): Node {
    const found = group(p, path);
    if (!found) return { path, token: true, children: [] };
    return { path, token: false, children: found.children.map((child) => node(p, child)) };
}

const p = defaultPermutation(doc);
export const tree = p ? p.root.children.map((path) => node(p, path)) : [];
