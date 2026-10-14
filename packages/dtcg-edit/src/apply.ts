import type { DesignTokens } from "@sugarcube-sh/dtcg";
import { type Node, findNodeAtLocation, getNodeValue, parseTree } from "jsonc-parser";
import { conflict } from "./error-messages.js";
import type { Committed, Conflict, FileOp, Json, OpResult } from "./index.js";
import { type Splice, indentUnit, lineBreak, removal, spliced } from "./json-text.js";
import { renameSplices, setSplices, valueAt } from "./text-edits.js";

type MemberOp = Exclude<FileOp, { kind: "createFile" | "deleteFile" }>;
type FileLevelOp = Extract<FileOp, { kind: "createFile" | "deleteFile" }>;
type Outcome = { conflict: Conflict["kind"] } | "stale" | undefined;
type Changed = Record<string, string | null>;

interface Draft {
    text: string;
    root?: Node | undefined;
    pending: Splice[];
}

interface Texts {
    of(file: string): string | undefined;
    set(file: string, text: string | null): void;
}

/**
 * Applies edits to the design tokens' text in order and reads the result as they were read,
 * returning the new design tokens. Every other line of each file is left as written.
 *
 * All or nothing: if any edit no longer applies, none is made, and every such edit comes back
 * with its reason. An edit no longer applies when its place has gone, when what it expects to
 * find (`was`) has changed since it was made, or when its file is one the design tokens aren't read
 * from, a new file included. An edit whose result is already there does nothing.
 *
 * @example
 * const next = apply(tokens, saved.ops);
 * if ("conflicts" in next) showConflicts(next.conflicts);
 * else tokens = next;
 */
export function apply(
    tokens: DesignTokens,
    ops: FileOp[],
): DesignTokens | { conflicts: Conflict[] } {
    const changes = changedFiles(tokens, ops);
    return "conflicts" in changes ? changes : changes.tokens;
}

/**
 * What saving edits would do to the files, without saving them: the new text of each file the edits
 * change, and the files they delete, with the design tokens as read from the result. Only a
 * `deleteFile` edit deletes a file, so one the resolver stops naming is kept. For saving somewhere
 * that takes whole files, such as a pull request. All or nothing, as {@link apply}: if any edit no
 * longer applies, the answer is the conflicts.
 *
 * @example
 * const changes = changedFiles(tokens, edits.ops);
 * if ("conflicts" in changes) showConflicts(changes.conflicts);
 * else await openPullRequest(changes);
 */
export function changedFiles(
    tokens: DesignTokens,
    ops: FileOp[],
):
    | { tokens: DesignTokens; written: Record<string, string>; deleted: string[] }
    | { conflicts: Conflict[] } {
    const { changed, conflicts } = editedFiles(tokens, ops);
    if (conflicts.length > 0) return { conflicts };
    const next = tokens.reread(changed);
    const lost = unread(next, ops);
    if (lost.length > 0) return { conflicts: lost.map((op) => conflict(op, "not-read")) };

    const written = Object.entries(changed)
        .flatMap(([file, text]): [string, string][] =>
            text !== null && text !== tokens.text(file) ? [[file, text]] : [],
        )
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const deleted = Object.keys(changed).filter((file) => changed[file] === null);
    return { tokens: next, written: Object.fromEntries(written), deleted: deleted.sort() };
}

export function applyWhatFits(
    tokens: DesignTokens,
    ops: FileOp[],
): { tokens: DesignTokens; applied: FileOp[]; skipped: FileOp[] } {
    const { changed, conflicts } = editedFiles(tokens, ops);
    if (conflicts.length === ops.length) return { tokens, applied: [], skipped: ops };
    const next = tokens.reread(changed);
    const lost = unread(next, ops);
    const failed = new Set([...conflicts.map(({ op }) => op), ...lost]);
    const skipped = ops.filter((op) => failed.has(op));
    return { tokens: next, applied: ops.filter((op) => !failed.has(op)), skipped };
}

function editedFiles(tokens: DesignTokens, ops: FileOp[]) {
    const changed: Changed = {};
    const texts: Texts = {
        of: (file) => (file in changed ? (changed[file] ?? undefined) : tokens.text(file)),
        set: (file, text) => {
            changed[file] = text;
        },
    };
    const drafts = new Map<string, Draft>();
    const style = texts.of(tokens.entry) ?? "";
    const conflicts: Conflict[] = [];
    const written = (file: string) => {
        const draft = drafts.get(file);
        if (draft && draft.pending.length > 0) texts.set(file, spliced(draft.text, draft.pending));
        drafts.delete(file);
    };
    const draftOf = (file: string) => {
        const text = texts.of(file);
        const draft = drafts.get(file) ?? (text === undefined ? undefined : { text, pending: [] });
        if (draft) drafts.set(file, draft);
        return draft;
    };
    for (const op of ops) {
        const kind = applyOne(op, style, texts, { draftOf, written });
        if (kind !== undefined) conflicts.push(conflict(op, kind));
    }
    for (const file of drafts.keys()) written(file);
    return { changed, conflicts };
}

function unread(next: DesignTokens, ops: FileOp[]): FileOp[] {
    return ops.filter((op) => op.kind === "createFile" && next.text(op.file) === undefined);
}

/**
 * Applies an operation's result in one step, as {@link apply} does. A question or a refusal is
 * handed back untouched.
 *
 * @example
 * const done = commit(tokens, rename(tokens, "color.brand", "primary"));
 * if ("tokens" in done) tokens = done.tokens;
 */
export function commit(tokens: DesignTokens, result: OpResult): Committed {
    if (!("ops" in result)) return result;
    const next = apply(tokens, result.ops);
    if ("conflicts" in next) return next;
    return { tokens: next, ops: result.ops, moved: result.moved };
}

function applyOne(
    op: FileOp,
    style: string,
    texts: Texts,
    {
        draftOf,
        written,
    }: { draftOf: (file: string) => Draft | undefined; written: (file: string) => void },
): Conflict["kind"] | undefined {
    if (op.kind === "createFile" || op.kind === "deleteFile") {
        written(op.file);
        return fileEdit(texts, op, style);
    }
    const draft = draftOf(op.file);
    if (!draft) return "not-read";
    const outcome = memberEdit(draft, op);
    if (outcome !== "stale") return outcome?.conflict;
    written(op.file);
    return applyOne(op, style, texts, { draftOf, written });
}

function fileEdit(texts: Texts, op: FileLevelOp, style: string): Conflict["kind"] | undefined {
    const existing = texts.of(op.file);
    if (op.kind === "deleteFile") {
        if (existing === undefined) return undefined;
        if (existing !== op.was) return "changed";
        texts.set(op.file, null);
        return undefined;
    }
    if (existing !== undefined) return same(valueAt(existing, []), op.value) ? undefined : "taken";
    const eol = lineBreak(style);
    const written = JSON.stringify(op.value, null, indentUnit(style));
    texts.set(op.file, written.replaceAll("\n", eol) + eol);
    return undefined;
}

function memberEdit(draft: Draft, op: MemberOp): Outcome {
    const { text, pending } = draft;
    draft.root ??= parseTree(text);
    const { root } = draft;
    const node = root && findNodeAtLocation(root, op.jsonPath);
    if (pending.length > 0 && (!node || reads(node, op).some((range) => touches(range, pending)))) {
        return "stale";
    }
    const current = node && (getNodeValue(node) as Json);
    const written = (unwritable: Conflict["kind"]): Outcome => {
        const splices = root && splicesFor(text, root, op);
        if (splices === undefined) return { conflict: unwritable };
        pending.push(...splices);
        return undefined;
    };

    switch (op.kind) {
        case "set":
            if (!node) return { conflict: "gone" };
            if (same(current, op.value)) return undefined;
            if (!same(current, op.was)) return { conflict: "changed" };
            return written("not-a-group");
        case "add":
            if (node) return same(current, op.value) ? undefined : { conflict: "taken" };
            return written("not-a-group");
        case "remove":
            if (!node) return undefined;
            if (!same(current, op.was)) return { conflict: "changed" };
            return written("not-a-group");
        case "renameKey": {
            if (!node) {
                const renamed =
                    root && findNodeAtLocation(root, [...op.jsonPath.slice(0, -1), op.name]);
                const there = renamed && (getNodeValue(renamed) as Json);
                return same(there, op.was) ? undefined : { conflict: "gone" };
            }
            return written("taken");
        }
    }
}

function splicesFor(text: string, root: Node, op: MemberOp): Splice[] | undefined {
    if (op.kind === "set" || op.kind === "add")
        return setSplices(text, root, op.jsonPath, op.value);
    const node = findNodeAtLocation(root, op.jsonPath);
    if (!node) return op.kind === "remove" ? [] : undefined;
    return op.kind === "remove" ? removal(text, node) : renameSplices(node, op.name);
}

function reads(node: Node, op: MemberOp): { offset: number; length: number }[] {
    const own = op.kind === "renameKey" ? (node.parent?.parent ?? node) : (node.parent ?? node);
    const keys: Node[] = [];
    for (let at = node.parent; at; at = at.parent) {
        const key = at.type === "property" ? at.children?.[0] : undefined;
        if (key) keys.push(key);
    }
    return [own, ...keys];
}

function touches(range: { offset: number; length: number }, splices: Splice[]): boolean {
    return splices.some(
        (splice) =>
            range.offset <= splice.offset + splice.length &&
            splice.offset <= range.offset + range.length,
    );
}

export function editedText(text: string, op: MemberOp): string | undefined {
    const root = parseTree(text);
    const splices = root && splicesFor(text, root, op);
    return splices && spliced(text, splices);
}

function same(a: Json | undefined, b: Json | undefined): boolean {
    if (a === b) return true;
    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
    if (Array.isArray(a) || Array.isArray(b)) {
        return (
            Array.isArray(a) &&
            Array.isArray(b) &&
            a.length === b.length &&
            a.every((each, i) => same(each, b[i]))
        );
    }
    const keys = Object.keys(a);
    return (
        keys.length === Object.keys(b).length &&
        keys.every((key) => key in b && same(a[key], b[key]))
    );
}
