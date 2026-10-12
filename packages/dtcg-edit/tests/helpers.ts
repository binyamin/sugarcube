import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type JsonPath, type Project, type ReadOptions, openFromMemory } from "@sugarcube-sh/dtcg";
import { type FileOp, type Json, type OpResult, commit } from "../src/index.js";
import { removeAt, setAt } from "../src/text-edits.js";

const folder = join(import.meta.dirname, "fixtures/demo");

export const demo = openFromMemory({
    files: Object.fromEntries(
        readdirSync(folder).map((name) => [name, readFileSync(join(folder, name), "utf8")]),
    ),
    entry: "tokens.resolver.json",
});

export const at = (project: Project, file: string, path: JsonPath): Json | undefined =>
    path.reduce((value, step) => value?.[step], JSON.parse(project.files[file] ?? "null"));

export function opsOf(result: OpResult): FileOp[] {
    if (!("ops" in result)) throw new Error(JSON.stringify(result));
    return result.ops;
}

export function committed(project: Project, result: OpResult): Project {
    const done = commit(project, result);
    if (!("project" in done)) throw new Error(JSON.stringify(done));
    return done.project;
}

export const resolver = (sources: object[], contexts: Record<string, object[]> = {}) =>
    JSON.stringify({
        version: "2025.10",
        resolutionOrder: [
            { type: "set", name: "base", sources },
            ...(Object.keys(contexts).length > 0
                ? [{ type: "modifier", name: "mode", default: "light", contexts }]
                : []),
        ],
    });

export const opened = (files: Record<string, string>, options?: ReadOptions) =>
    openFromMemory({ files, entry: "tokens.resolver.json" }, options);

export function changed(
    project: Project,
    changes: [file: string, path: JsonPath, value: Json | undefined][],
): Project {
    const files = { ...project.files };
    for (const [file, path, value] of changes) {
        const text = files[file] ?? "";
        const edited = value === undefined ? removeAt(text, path) : setAt(text, path, value);
        if (edited === undefined) throw new Error("the test's own edit could not be made");
        files[file] = edited;
    }
    return openFromMemory({ files, entry: project.entry }, project.options);
}
