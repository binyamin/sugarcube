import type { DesignTokens, Group, Permutation, Token, TokenType } from "@sugarcube-sh/dtcg";
import { type TypographyCSS, cssValue } from "@sugarcube-sh/dtcg/css";

export interface TreeNode {
    readonly path: string;
    readonly name: string;
    readonly count: number;
    readonly children: readonly TreeNode[];
    readonly hasValue?: true;
}

export interface Crumb {
    readonly path: string;
    readonly name: string;
}

export interface GroupRow {
    readonly path: string;
    readonly name: string;
    readonly count: number;
}

export interface TokenRow {
    readonly path: string;
    readonly name: string;
    readonly type: TokenType;
    readonly written: unknown;
    readonly css: string | TypographyCSS | undefined;
}

export interface GroupView {
    readonly path: string;
    readonly description?: string;
    readonly groups: readonly GroupRow[];
    readonly tokens: readonly TokenRow[];
}

type Draft = { path: string; name: string; children: Map<string, Draft>; hasValue?: true };

export function sidebarTree(tokens: DesignTokens): TreeNode[] {
    const roots = new Map<string, Draft>();

    function place(
        children: readonly (Token | Group)[],
        level: Map<string, Draft>,
        parent?: { draft: Draft; group: Group },
    ) {
        for (const child of children) {
            if (parent && child === parent.group.rootToken) {
                parent.draft.hasValue = true;
                continue;
            }
            const name = parent ? child.path.slice(parent.group.path.length + 1) : child.path;
            let draft = level.get(name);
            if (!draft) {
                draft = { path: child.path, name, children: new Map() };
                level.set(name, draft);
            }
            if (child.kind === "group")
                place(child.children, draft.children, { draft, group: child });
        }
    }

    for (const permutation of tokens.permutations) place(permutation.children, roots);

    return Array.from(roots.values(), finish);
}

function finish(draft: Draft): TreeNode {
    const children = Array.from(draft.children.values(), finish);
    const own = draft.hasValue ? 1 : 0;
    return {
        path: draft.path,
        name: draft.name,
        count:
            children.length > 0 ? own + children.reduce((sum, child) => sum + child.count, 0) : 1,
        children,
        ...(draft.hasValue ? { hasValue: true as const } : {}),
    };
}

export function trail(path: string): Crumb[] {
    const names = path.split(".");
    return names.map((name, index) => ({ path: names.slice(0, index + 1).join("."), name }));
}

export function groupView(permutation: Permutation, path: string): GroupView | undefined {
    const group = permutation.group(path);
    if (!group) return undefined;
    const below = (child: Token | Group) => child.path.slice(path.length + 1);

    return {
        path,
        ...(group.description === undefined ? {} : { description: group.description }),
        groups: group.children
            .filter((child): child is Group => child.kind === "group")
            .map((child) => ({ path: child.path, name: below(child), count: child.tokens.length })),
        tokens: group.childTokens.map((token) => ({
            path: token.path,
            name: below(token),
            type: token.type,
            written: token.authored?.value,
            css: cssValue(token),
        })),
    };
}
