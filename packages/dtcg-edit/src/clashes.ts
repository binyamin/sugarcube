import { type JsonPath, type Project, type Span, forbiddenInName } from "@sugarcube-sh/dtcg";
import { editedText } from "./apply.js";
import type { Clash, FileOp } from "./index.js";
import { placeOf, spanKey, writtenAt } from "./project-text.js";
import { valueAt } from "./text-edits.js";

export function clashesOf(skipped: FileOp[], theirs: Project, mine: Project): Clash[] {
    const byPlace = new Map<string, { file: string; place: JsonPath; ops: FileOp[] }>();
    for (const op of skipped) {
        const place = editedPlace(op);
        const key = placeKey(op.file, place);
        const found = byPlace.get(key) ?? { file: op.file, place, ops: [] };
        found.ops.push(op);
        byPlace.set(key, found);
    }
    if (byPlace.size === 0) return [];
    const files = new Set([...byPlace.values()].map(({ file }) => file));
    const named = namesByPlace([mine, theirs], files);
    return [...byPlace].map(([key, { file, place, ops }]) => {
        const forced = ops.reduce(force, mine.files[file] ?? "{}");
        const clash: Clash = { path: named.get(key) ?? place.join("."), file };
        const yours = forced === undefined ? undefined : valueAt(forced, place);
        const now = writtenAt(theirs, file, place);
        if (yours !== undefined) clash.yours = yours;
        if (now !== undefined) clash.theirs = now;
        return clash;
    });
}

function editedPlace(op: FileOp): JsonPath {
    if (!("path" in op)) return [];
    const end = op.path.findIndex(
        (step) => typeof step === "string" && forbiddenInName(step) === "$",
    );
    return end === -1 ? op.path : op.path.slice(0, end);
}

function force(text: string | undefined, op: FileOp): string | undefined {
    if (text === undefined || op.kind === "deleteFile") return undefined;
    if (op.kind === "createFile") return JSON.stringify(op.value);
    return editedText(text, op) ?? text;
}

function namesByPlace(projects: Project[], files: Set<string>): Map<string, string> {
    const named = new Map<string, string>();
    const seen = new Set<string>();
    const name = (project: Project, span: Span, path: string) => {
        const at = spanKey(span);
        if (!files.has(span.file) || seen.has(at)) return;
        seen.add(at);
        const place = placeOf(project, span);
        const key = place && placeKey(span.file, place.path);
        if (key && !named.has(key)) named.set(key, path);
    };
    for (const project of projects) {
        for (const permutation of project.doc.permutations) {
            for (const token of permutation.tokens) {
                for (const { span } of token.writtenAt) name(project, span, token.path);
            }
            for (const group of permutation.groups) {
                for (const { span } of group.writtenAt) name(project, span, group.path);
            }
        }
    }
    return named;
}

function placeKey(file: string, place: JsonPath): string {
    return JSON.stringify([file, place]);
}
