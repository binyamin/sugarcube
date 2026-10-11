import { type JsonPath, type Project, openFromMemory } from "@sugarcube-sh/dtcg";
import { conflictReasons } from "./error-messages.js";
import type { Committed, Conflict, FileOp, Json, OpResult } from "./index.js";
import { indentUnit, lineBreak } from "./json-text.js";
import { removeAt, renameKeyAt, setAt, valueAt } from "./text-edits.js";

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
    const files: Record<string, string> = { ...project.files };
    const style = project.files[project.entry ?? Object.keys(project.files)[0] ?? ""] ?? "";
    const conflicts: Conflict[] = [];
    for (const op of ops) {
        const reason = applyOne(files, op, style);
        if (reason !== undefined) conflicts.push({ op, reason });
    }
    if (conflicts.length > 0) return { conflicts };

    const next = openFromMemory(
        { files, ...(project.entry !== undefined && { entry: project.entry }) },
        project.options,
    );
    const lost = ops.filter((op) => op.kind === "createFile" && next.files[op.file] === undefined);
    if (lost.length > 0) {
        return { conflicts: lost.map((op) => ({ op, reason: conflictReasons.unread(op.file) })) };
    }
    return next;
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

function applyOne(files: Record<string, string>, op: FileOp, style: string): string | undefined {
    const existing = files[op.file];

    if (op.kind === "createFile") {
        if (existing !== undefined) {
            return same(valueAt(existing, []), op.value)
                ? undefined
                : conflictReasons.fileExists(op.file);
        }
        const eol = lineBreak(style);
        const written = JSON.stringify(op.value, null, indentUnit(style));
        files[op.file] = written.replaceAll("\n", eol) + eol;
        return undefined;
    }

    if (op.kind === "deleteFile") {
        if (existing === undefined) return undefined;
        if (existing !== op.was) return conflictReasons.fileChanged(op.file);
        delete files[op.file];
        return undefined;
    }

    if (existing === undefined) return conflictReasons.notInProject(op.file);
    const place = placeOf(op.file, op.path);
    const current = valueAt(existing, op.path);
    let text: string | undefined;

    if (op.kind === "set") {
        if (current === undefined) return conflictReasons.gone(place);
        if (same(current, op.value)) return undefined;
        if (!same(current, op.was)) return conflictReasons.changedSince(place);
        text = setAt(existing, op.path, op.value);
    } else if (op.kind === "add") {
        if (current !== undefined) {
            return same(current, op.value) ? undefined : conflictReasons.alreadyThere(place);
        }
        text = setAt(existing, op.path, op.value);
    } else if (op.kind === "remove") {
        if (current === undefined) return undefined;
        if (!same(current, op.was)) return conflictReasons.changedSince(place);
        text = removeAt(existing, op.path);
    } else {
        if (current === undefined) {
            const renamed = valueAt(existing, [...op.path.slice(0, -1), op.name]);
            return same(renamed, op.was) ? undefined : conflictReasons.gone(place);
        }
        text = renameKeyAt(existing, op.path, op.name);
        if (text === undefined) return conflictReasons.nameTaken(place, op.name);
    }

    if (text === undefined) return conflictReasons.notAGroup(place);
    files[op.file] = text;
    return undefined;
}

function placeOf(file: string, path: JsonPath): string {
    return `\`${path.join(".")}\` in \`${file}\``;
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
