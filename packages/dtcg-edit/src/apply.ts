import type { Project } from "@sugarcube-sh/dtcg";
import { conflict } from "./error-messages.js";
import type { Committed, Conflict, FileOp, Json, OpResult } from "./index.js";
import { indentUnit, lineBreak } from "./json-text.js";
import { reread } from "./reread.js";
import { removeAt, renameKeyAt, setAt, valueAt } from "./text-edits.js";

export type MemberOp = Exclude<FileOp, { kind: "createFile" | "deleteFile" }>;
type FileLevelOp = Extract<FileOp, { kind: "createFile" | "deleteFile" }>;
type Outcome = { text: string } | { conflict: Conflict["kind"] } | undefined;

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
    const { files, conflicts } = editedFiles(project, ops);
    if (conflicts.length > 0) return { conflicts };

    const next = reread(project, files);
    const lost = unread(next, ops);
    if (lost.length > 0) return { conflicts: lost.map((op) => conflict(op, "unread")) };
    return next;
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
    const style = project.files[project.entry ?? Object.keys(project.files)[0] ?? ""] ?? "";
    const conflicts: Conflict[] = [];
    for (const op of ops) {
        const kind = applyOne(files, op, style);
        if (kind !== undefined) conflicts.push(conflict(op, kind));
    }
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
    files: Record<string, string>,
    op: FileOp,
    style: string,
): Conflict["kind"] | undefined {
    if (op.kind === "createFile" || op.kind === "deleteFile") return fileEdit(files, op, style);
    const text = files[op.file];
    if (text === undefined) return "not-in-project";
    const outcome = memberEdit(text, op);
    if (outcome === undefined) return undefined;
    if ("conflict" in outcome) return outcome.conflict;
    files[op.file] = outcome.text;
    return undefined;
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

function memberEdit(text: string, op: MemberOp): Outcome {
    const current = valueAt(text, op.path);
    const written = (edited: string | undefined): Outcome =>
        edited === undefined ? { conflict: "not-a-group" } : { text: edited };

    switch (op.kind) {
        case "set":
            if (current === undefined) return { conflict: "gone" };
            if (same(current, op.value)) return undefined;
            if (!same(current, op.was)) return { conflict: "changed" };
            return written(editedText(text, op));
        case "add":
            if (current !== undefined)
                return same(current, op.value) ? undefined : { conflict: "taken" };
            return written(editedText(text, op));
        case "remove":
            if (current === undefined) return undefined;
            if (!same(current, op.was)) return { conflict: "changed" };
            return written(editedText(text, op));
        case "renameKey": {
            if (current === undefined) {
                const renamed = valueAt(text, [...op.path.slice(0, -1), op.name]);
                return same(renamed, op.was) ? undefined : { conflict: "gone" };
            }
            const edited = editedText(text, op);
            return edited === undefined ? { conflict: "taken" } : { text: edited };
        }
    }
}

export function editedText(text: string, op: MemberOp): string | undefined {
    switch (op.kind) {
        case "set":
        case "add":
            return setAt(text, op.path, op.value);
        case "remove":
            return removeAt(text, op.path);
        case "renameKey":
            return renameKeyAt(text, op.path, op.name);
    }
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
