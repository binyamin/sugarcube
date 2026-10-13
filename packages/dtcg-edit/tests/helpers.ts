import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
    type DesignSystem,
    type JsonPath,
    type ReadOptions,
    readFromMemory,
} from "@sugarcube-sh/dtcg";
import { type FileOp, type Json, type OpResult, commit } from "../src/index.js";
import { removeAt, setAt } from "../src/text-edits.js";

const folder = join(import.meta.dirname, "fixtures/demo");

export const demo = readFromMemory({
    files: Object.fromEntries(
        readdirSync(folder).map((name) => [name, readFileSync(join(folder, name), "utf8")]),
    ),
    entry: "tokens.resolver.json",
});

export const textsOf = (ds: DesignSystem): Record<string, string | undefined> =>
    Object.fromEntries(ds.files.map((file) => [file, ds.text(file)]));

export const at = (ds: DesignSystem, file: string, jsonPath: JsonPath): Json | undefined =>
    jsonPath.reduce((value, step) => value?.[step], JSON.parse(ds.text(file) ?? "null"));

export function opsOf(result: OpResult): FileOp[] {
    if (!("ops" in result)) throw new Error(JSON.stringify(result));
    return result.ops;
}

export function committed(ds: DesignSystem, result: OpResult): DesignSystem {
    const done = commit(ds, result);
    if (!("ds" in done)) throw new Error(JSON.stringify(done));
    return done.ds;
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
    readFromMemory({ files, entry: "tokens.resolver.json" }, options);

export function changed(
    ds: DesignSystem,
    changes: [file: string, jsonPath: JsonPath, value: Json | undefined][],
): DesignSystem {
    const texts: Record<string, string> = {};
    for (const [file, jsonPath, value] of changes) {
        const text = texts[file] ?? ds.text(file) ?? "";
        const edited =
            value === undefined ? removeAt(text, jsonPath) : setAt(text, jsonPath, value);
        if (edited === undefined) throw new Error("the test's own edit could not be made");
        texts[file] = edited;
    }
    return ds.reread(texts);
}
