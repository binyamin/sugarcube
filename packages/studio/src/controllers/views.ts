import type {
    Change,
    DesignTokens,
    Group,
    Permutation,
    Permutations,
    Token,
    TokenType,
} from "@sugarcube-sh/dtcg";
import type { TypographyCSS } from "@sugarcube-sh/dtcg/css";
import type { BuildProblem, BuildOutput } from "./adapter";

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

export interface ProblemRow {
    readonly place?: string;
    readonly severity: BuildProblem["severity"];
    readonly message: string;
    readonly inPermutations?: string;
    readonly kind: string;
    readonly paths?: readonly string[];
}

export interface ChangeLine {
    readonly kind: Change["kind"];
    readonly path?: string;
    readonly from?: string;
    readonly inPermutations?: string;
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

export function nodeAt(
    tokens: DesignTokens,
    showing: Permutation,
    path: string,
): { node: Token | Group; shown: boolean } | undefined {
    const here = showing.token(path) ?? showing.group(path);
    if (here) return { node: here, shown: true };
    for (const permutation of tokens.permutations) {
        const there = permutation.token(path) ?? permutation.group(path);
        if (there) return { node: there, shown: false };
    }
    return undefined;
}

export function trail(path: string): Crumb[] {
    const names = path.split(".");
    return names.map((name, index) => ({ path: names.slice(0, index + 1).join("."), name }));
}

export function groupView(group: Group, value: BuildOutput["value"]): GroupView {
    const below = (child: Token | Group) => child.path.slice(group.path.length + 1);
    return {
        path: group.path,
        ...(group.description === undefined ? {} : { description: group.description }),
        groups: group.children
            .filter((child): child is Group => child.kind === "group")
            .map((child) => ({ path: child.path, name: below(child), count: child.tokens.length })),
        tokens: group.childTokens.map((token) => tokenRow(token, below(token), value)),
    };
}

export function tokenRow(token: Token, name: string, value: BuildOutput["value"]): TokenRow {
    return {
        path: token.path,
        name,
        type: token.type,
        written: token.authored?.value,
        css: value(token),
    };
}

export function problemRows(problems: readonly BuildProblem[]): ProblemRow[] {
    return problems.map(({ span, severity, message, permutations, kind, path, related }) => {
        const label = partialLabel(permutations);
        const paths = [
            ...new Set([path, ...(related ?? []).map((each) => each.path)].filter(isPath)),
        ];
        return {
            ...(span && paths.length === 0
                ? { place: `${span.file}:${span.start.line}:${span.start.column}` }
                : {}),
            severity,
            message,
            ...(label ? { inPermutations: label } : {}),
            kind,
            ...(paths.length > 0 ? { paths } : {}),
        };
    });
}

export function changeLines(changes: readonly Change[]): ChangeLine[] {
    return changes.map((change) => {
        const label = partialLabel(change.permutations);
        return {
            kind: change.kind,
            ...("from" in change ? { from: change.from } : {}),
            ...("path" in change ? { path: change.path } : {}),
            ...(label ? { inPermutations: label } : {}),
        };
    });
}

function partialLabel(permutations: Permutations | undefined): string | undefined {
    const label = permutations?.label;
    return label === "everywhere" || label === "nowhere" ? undefined : label;
}

function isPath(path: string | undefined): path is string {
    return path !== undefined;
}
