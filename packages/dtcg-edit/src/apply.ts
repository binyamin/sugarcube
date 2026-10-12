import type { Project } from "@sugarcube-sh/dtcg";
import { type Node, findNodeAtLocation, getNodeValue, parseTree } from "jsonc-parser";
import { conflict } from "./error-messages.js";
import type { Committed, Conflict, FileOp, Json, OpResult } from "./index.js";
import { type Splice, indentUnit, lineBreak, removal, spliced } from "./json-text.js";
import { reread } from "./reread.js";
import { renameSplices, setSplices, valueAt } from "./text-edits.js";

export type MemberOp = Exclude<FileOp, { kind: "createFile" | "deleteFile" }>;
type FileLevelOp = Extract<FileOp, { kind: "createFile" | "deleteFile" }>;
type Outcome = { conflict: Conflict["kind"] } | "stale" | undefined;

interface Draft {
    text: string;
    root?: Node | undefined;
    pending: Splice[];
}

/**
 * Applies edits to a project's text in order and reads the result with the project's own
 * options, returning a new project. Every other line of each file is left as written.
 *
 * All or nothing: if any edit no longer applies, none is made, and every such edit comes back
 * with its reason. An edit no longer applies when its place has gone, when what it expects to
 * find (`was`) has changed since it was made, or when a new file would not be read by the
 * project. An edit whose result is already there does nothing.
 *
 * @example
 * const next = apply(project, saved.ops);
 * if ("conflicts" in next) showConflicts(next.conflicts);
 * else project = next;
 */
export function apply(project: Project, ops: FileOp[]): Project | { conflicts: Conflict[] } {
    const done = applyKeepingTexts(project, ops);
    return "conflicts" in done ? done : done.project;
}

export function applyKeepingTexts(
    project: Project,
    ops: FileOp[],
): { project: Project; files: Record<string, string> } | { conflicts: Conflict[] } {
    const { files, conflicts } = editedFiles(project, ops);
    if (conflicts.length > 0) return { conflicts };

    const next = reread(project, files);
    const lost = unread(next, ops);
    if (lost.length > 0) return { conflicts: lost.map((op) => conflict(op, "unread")) };
    return { project: next, files };
}

export function applyWhatFits(
    project: Project,
    ops: FileOp[],
): { project: Project; applied: FileOp[]; skipped: FileOp[] } {
    const { files, conflicts } = editedFiles(project, ops);
    if (conflicts.length === ops.length) return { project, applied: [], skipped: ops };
    let next = reread(project, files);
    const lost = unread(next, ops);
    if (lost.length > 0) {
        for (const op of lost) delete files[op.file];
        next = reread(project, files);
    }
    const failed = new Set([...conflicts.map(({ op }) => op), ...lost]);
    const skipped = ops.filter((op) => failed.has(op));
    return { project: next, applied: ops.filter((op) => !failed.has(op)), skipped };
}

function editedFiles(project: Project, ops: FileOp[]) {
    const files: Record<string, string> = { ...project.files };
    const drafts = new Map<string, Draft>();
    const style = project.files[project.entry] ?? "";
    const conflicts: Conflict[] = [];
    const written = (file: string) => {
        const draft = drafts.get(file);
        if (draft && draft.pending.length > 0) files[file] = spliced(draft.text, draft.pending);
        drafts.delete(file);
    };
    const draftOf = (file: string) => {
        const text = files[file];
        const draft = drafts.get(file) ?? (text === undefined ? undefined : { text, pending: [] });
        if (draft) drafts.set(file, draft);
        return draft;
    };
    for (const op of ops) {
        const kind = applyOne(op, style, files, { draftOf, written });
        if (kind !== undefined) conflicts.push(conflict(op, kind));
    }
    for (const file of drafts.keys()) written(file);
    return { files, conflicts };
}

function unread(next: Project, ops: FileOp[]): FileOp[] {
    return ops.filter((op) => op.kind === "createFile" && next.files[op.file] === undefined);
}

/**
 * Applies an operation's result in one step, as {@link apply} does. A question or a refusal is
 * handed back untouched.
 *
 * @example
 * const done = commit(project, rename(project, "color.brand", "primary"));
 * if ("project" in done) project = done.project;
 */
export function commit(project: Project, result: OpResult): Committed {
    if (!("ops" in result)) return result;
    const next = apply(project, result.ops);
    if ("conflicts" in next) return next;
    return { project: next, ops: result.ops, moved: result.moved };
}

function applyOne(
    op: FileOp,
    style: string,
    files: Record<string, string>,
    {
        draftOf,
        written,
    }: { draftOf: (file: string) => Draft | undefined; written: (file: string) => void },
): Conflict["kind"] | undefined {
    if (op.kind === "createFile" || op.kind === "deleteFile") {
        written(op.file);
        return fileEdit(files, op, style);
    }
    const draft = draftOf(op.file);
    if (!draft) return "not-in-project";
    const outcome = memberEdit(draft, op);
    if (outcome !== "stale") return outcome?.conflict;
    written(op.file);
    return applyOne(op, style, files, { draftOf, written });
}

function fileEdit(
    files: Record<string, string>,
    op: FileLevelOp,
    style: string,
): Conflict["kind"] | undefined {
    const existing = files[op.file];
    if (op.kind === "deleteFile") {
        if (existing === undefined) return undefined;
        if (existing !== op.was) return "changed";
        delete files[op.file];
        return undefined;
    }
    if (existing !== undefined) return same(valueAt(existing, []), op.value) ? undefined : "taken";
    const eol = lineBreak(style);
    const written = JSON.stringify(op.value, null, indentUnit(style));
    files[op.file] = written.replaceAll("\n", eol) + eol;
    return undefined;
}

function memberEdit(draft: Draft, op: MemberOp): Outcome {
    const { text, pending } = draft;
    draft.root ??= parseTree(text);
    const { root } = draft;
    const node = root && findNodeAtLocation(root, op.path);
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
                    root && findNodeAtLocation(root, [...op.path.slice(0, -1), op.name]);
                const there = renamed && (getNodeValue(renamed) as Json);
                return same(there, op.was) ? undefined : { conflict: "gone" };
            }
            return written("taken");
        }
    }
}

function splicesFor(text: string, root: Node, op: MemberOp): Splice[] | undefined {
    if (op.kind === "set" || op.kind === "add") return setSplices(text, root, op.path, op.value);
    const node = findNodeAtLocation(root, op.path);
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
