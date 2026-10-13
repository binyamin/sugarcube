import { type DesignSystem, type JsonPath, forbiddenInName } from "@sugarcube-sh/dtcg";
import { editedText } from "./apply.js";
import { memberAt, writtenIn } from "./file-text.js";
import type { Clash, FileOp } from "./index.js";
import { valueAt } from "./text-edits.js";

export function clashesOf(skipped: FileOp[], theirs: DesignSystem, mine: DesignSystem): Clash[] {
    const byMember = new Map<string, { file: string; jsonPath: JsonPath; ops: FileOp[] }>();
    for (const op of skipped) {
        const jsonPath = editedMember(op);
        const key = memberKey(op.file, jsonPath);
        const found = byMember.get(key) ?? { file: op.file, jsonPath, ops: [] };
        found.ops.push(op);
        byMember.set(key, found);
    }
    if (byMember.size === 0) return [];
    const files = new Set([...byMember.values()].map(({ file }) => file));
    const named = pathsByMember([mine, theirs], files);
    return [...byMember].map(([key, { file, jsonPath, ops }]) => {
        const forced = ops.reduce(force, mine.text(file) ?? "{}");
        const clash: Clash = { path: named.get(key) ?? jsonPath.join("."), file };
        const yours = forced === undefined ? undefined : valueAt(forced, jsonPath);
        const now = writtenIn(theirs, file, jsonPath);
        if (yours !== undefined) clash.yours = yours;
        if (now !== undefined) clash.theirs = now;
        return clash;
    });
}

function editedMember(op: FileOp): JsonPath {
    if (!("jsonPath" in op)) return [];
    const end = op.jsonPath.findIndex(
        (step) => typeof step === "string" && forbiddenInName(step) === "$",
    );
    return end === -1 ? op.jsonPath : op.jsonPath.slice(0, end);
}

function force(text: string | undefined, op: FileOp): string | undefined {
    if (text === undefined || op.kind === "deleteFile") return undefined;
    if (op.kind === "createFile") return JSON.stringify(op.value);
    return editedText(text, op) ?? text;
}

function pathsByMember(designSystems: DesignSystem[], files: Set<string>): Map<string, string> {
    const named = new Map<string, string>();
    for (const ds of designSystems) {
        for (const path of [...ds.tokenPaths(), ...ds.groupPaths()]) {
            for (const { span } of ds.writtenAt(path)) {
                if (!files.has(span.file)) continue;
                const member = memberAt(ds, span);
                const key = member && memberKey(span.file, member.jsonPath);
                if (key && !named.has(key)) named.set(key, path);
            }
        }
    }
    return named;
}

function memberKey(file: string, jsonPath: JsonPath): string {
    return JSON.stringify([file, jsonPath]);
}
