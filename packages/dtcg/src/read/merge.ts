import { relatedMessages } from "../error-messages.js";
import { atOrWithin } from "../path.js";
import type { Input, Span } from "../index.js";
import { diagnostic, type Problems } from "./diagnostics.js";
import type { Inheritable } from "./inherit.js";
import type { Settings } from "./settings.js";
import type {
    ExtensionsAt,
    GroupReference,
    Properties,
    SourceContents,
    SourceGroup,
    SourceToken,
    SourceTopLevel,
} from "./walk.js";

export interface Piece {
    order: number;
    source: number;
}

export interface WrittenAt {
    index: number;
    span: Span;
}

export interface MergedToken extends SourceToken {
    piece: Piece;
    replaces?: WrittenAt[];
    inherited?: { from: string };
    generated?: { from?: string; extension: readonly [string, ...string[]] };
    added?: true;
}

export interface MergedTopLevel extends Properties {
    declaredIn: WrittenAt[];
    extensionsAt?: Record<string, ExtensionsAt & { piece: Piece }>;
}

export interface MergedGroup extends MergedTopLevel {
    path: string;
    extends?: GroupReference & { piece: Piece };
    extendsGroup?: string;
    takesFrom?: string;
    inherited?: { from: string };
}

export interface Merged {
    root: MergedTopLevel;
    tokens: Map<string, MergedToken>;
    groups: Map<string, MergedGroup>;
    order: Set<string>;
    children: Map<string | undefined, string[]>;
    settings: Map<MergedTopLevel, Settings>;
    inheritedAt: { [K in Inheritable]: Map<string, Properties[K]> };
}

export function merge(
    pieces: { contents: SourceContents | undefined; source: number }[],
    permutation: Input,
    diagnostics: Problems,
): Merged {
    const merged: Merged = {
        root: { declaredIn: [] },
        tokens: new Map(),
        groups: new Map(),
        order: new Set(),
        children: new Map(),
        settings: new Map(),
        inheritedAt: { type: new Map(), deprecated: new Map() },
    };
    const conflict = (path: string, later: Span, earlier: Span[], earlierIs: "token" | "group") =>
        diagnostics.found(
            diagnostic(
                "token-and-group",
                { reason: "declared", here: earlierIs === "token" ? "group" : "token" },
                {
                    span: later,
                    path,
                    permutation,
                    related: earlier.map((span) => ({
                        message: relatedMessages.declaredAs(earlierIs),
                        span,
                    })),
                },
            ),
        );

    for (const [order, { contents, source }] of pieces.entries()) {
        if (!contents) continue;
        const piece = { order, source };
        mergeInto(merged.root, contents.root, piece);
        for (const member of contents.members) {
            if ("group" in member) {
                const { group } = member;
                merged.order.add(group.path);
                const token = merged.tokens.get(group.path);
                if (token) {
                    conflict(group.path, group.span, [token.span], "token");
                    merged.tokens.delete(group.path);
                }
                mergeGroup(merged.groups, group, piece);
                continue;
            }
            const { token } = member;
            merged.order.add(token.path);
            const group = merged.groups.get(token.path);
            if (group) {
                conflict(
                    token.path,
                    token.span,
                    group.declaredIn.map(({ span }) => span),
                    "group",
                );
                removeGroup(merged, token.path);
            }
            const earlier = merged.tokens.get(token.path);
            const replaces = earlier && [
                ...(earlier.replaces ?? []),
                { index: earlier.piece.source, span: earlier.span },
            ];
            merged.tokens.set(token.path, { ...token, piece, ...(replaces && { replaces }) });
        }
    }
    return merged;
}

function mergeGroup(groups: Map<string, MergedGroup>, group: SourceGroup, piece: Piece): void {
    const { path, extends: extending, ...rest } = group;
    const existing = groups.get(path) ?? { path, declaredIn: [] };
    mergeInto(existing, rest, piece);
    if (extending) existing.extends = { ...extending, piece };
    groups.set(path, existing);
}

function mergeInto(existing: MergedTopLevel, source: SourceTopLevel, piece: Piece): void {
    const { span, extensionsAt, ...properties } = source;
    mergeProperties(existing, properties);
    existing.declaredIn.push({ index: piece.source, span });
    if (extensionsAt && properties.extensions) {
        const declared = { ...extensionsAt, piece };
        const keys = Object.keys(properties.extensions).map((key) => [key, declared]);
        existing.extensionsAt = { ...existing.extensionsAt, ...Object.fromEntries(keys) };
    }
}

export function everyGroup(merged: Merged): [path: string | undefined, MergedTopLevel][] {
    return [[undefined, merged.root], ...merged.groups.entries()];
}

function mergeProperties(target: Properties, { extensions, ...rest }: Properties): void {
    Object.assign(target, rest);
    if (extensions) target.extensions = { ...target.extensions, ...extensions };
}

export function removeGroup(merged: Merged, path: string): void {
    for (const each of merged.groups.keys()) if (atOrWithin(each, path)) merged.groups.delete(each);
    for (const each of merged.tokens.keys()) if (atOrWithin(each, path)) merged.tokens.delete(each);
}
