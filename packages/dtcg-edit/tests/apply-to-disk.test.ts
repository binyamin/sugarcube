import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { open } from "@sugarcube-sh/dtcg/node";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setValue } from "../src/index.js";
import { applyToDisk } from "../src/node.js";
import { at, changed, demo, opsOf } from "./helpers.js";
import type { FileOp, Json } from "../src/index.js";

let folder: string;
let entry: string;
const read = (file: string) => readFileSync(join(folder, file), "utf8");
const write = (file: string, text: string) => writeFileSync(join(folder, file), text);
const written = (result: Awaited<ReturnType<typeof applyToDisk>>) =>
    "written" in result ? Object.keys(result.written) : undefined;

beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), "dtcg-edit-"));
    cpSync(join(import.meta.dirname, "fixtures/demo"), folder, { recursive: true });
    write("package.json", '{ "name": "demo" }\n');
    entry = join(folder, "tokens.resolver.json");
});

afterEach(() => {
    rmSync(folder, { recursive: true, force: true });
});

const half = { value: 0.5, unit: "rem" };

describe("applyToDisk", () => {
    it("writes the edits to the files they change, and nothing else", async () => {
        const before = readdirSync(folder).map((file) => [file, read(file)]);
        const result = await applyToDisk({ entry }, opsOf(setValue(demo, "radius.md", half)));

        expect(written(result)).toStrictEqual(["radius.json"]);
        expect(result).toMatchObject({ deleted: [] });
        expect(JSON.parse(read("radius.json")).radius.md.$value).toEqual(half);
        for (const [file, text] of before) {
            if (file !== "radius.json") expect(read(file as string)).toBe(text);
        }
    });

    it("hands back the project as read from the files written", async () => {
        const result = await applyToDisk({ entry }, opsOf(setValue(demo, "radius.md", half)));

        if (!("project" in result)) throw new Error(JSON.stringify(result));
        expect(result.project.doc.permutation().token("radius.md")?.authored?.value).toEqual(half);
        expect(result.project.files).toEqual((await open(entry)).files);
    });

    it("reads the files with the source's own options", async () => {
        const options = { hexStringColors: true };
        const result = await applyToDisk(
            { entry, options },
            opsOf(setValue(demo, "radius.md", half)),
        );

        expect(result).toMatchObject({ project: { options } });
    });

    it("keeps a change made on disk since the edits were made", async () => {
        const ops = opsOf(setValue(demo, "radius.md", half));
        const theirs = changed(demo, [
            ["radius.json", ["radius", "lg", "$value"], { value: 9, unit: "px" }],
        ]);
        write("radius.json", theirs.files["radius.json"] ?? "");

        await applyToDisk({ entry }, ops);
        const radius = JSON.parse(read("radius.json")).radius;
        expect(radius.md.$value).toEqual(half);
        expect(radius.lg.$value).toEqual({ value: 9, unit: "px" });
    });

    it("writes nothing when any edit no longer fits, though others would", async () => {
        const fits = opsOf(setValue(demo, "radius.md", half));
        const clashes: FileOp = {
            kind: "renameKey",
            file: "color.json",
            path: ["color", "brand", "500"],
            name: "600",
            was: at(demo, "color.json", ["color", "brand", "500"]) ?? null,
        };
        const before = { radius: read("radius.json"), color: read("color.json") };
        const result = await applyToDisk({ entry }, [...fits, clashes]);

        expect(result).toEqual({ conflicts: [expect.objectContaining({ kind: "taken" })] });
        expect(read("radius.json")).toBe(before.radius);
        expect(read("color.json")).toBe(before.color);
    });

    it("won't write a file the design system doesn't read", async () => {
        const op: FileOp = {
            kind: "set",
            file: "package.json",
            path: ["name"],
            value: "x",
            was: "demo",
        };
        const result = await applyToDisk({ entry }, [op]);

        expect(result).toEqual({
            conflicts: [expect.objectContaining({ kind: "not-in-project" })],
        });
        expect(read("package.json")).toBe('{ "name": "demo" }\n');
    });

    it("won't make a file nothing reads, and makes one the same edits add to the resolver", async () => {
        const make: FileOp = { kind: "createFile", file: "extra.json", value: { extra: {} } };
        expect(await applyToDisk({ entry }, [make])).toEqual({
            conflicts: [expect.objectContaining({ kind: "unread" })],
        });
        expect(readdirSync(folder)).not.toContain("extra.json");

        const sources = ["resolutionOrder", 0, "sources"];
        const was = at(demo, "tokens.resolver.json", sources) as Json[];
        const reference: FileOp = {
            kind: "set",
            file: "tokens.resolver.json",
            path: sources,
            value: [...was, { $ref: "./extra.json" }],
            was,
        };
        const result = await applyToDisk({ entry }, [make, reference]);
        expect(written(result)).toStrictEqual(["extra.json", "tokens.resolver.json"]);
        expect(JSON.parse(read("extra.json"))).toEqual({ extra: {} });
    });

    it("makes the folder a new file goes in", async () => {
        const result = await applyToDisk({ entry }, madeAndRead("more/extra.json"));

        expect(written(result)).toStrictEqual(["more/extra.json", "tokens.resolver.json"]);
        expect(JSON.parse(read("more/extra.json"))).toEqual({ extra: {} });
    });

    it("writes nothing and leaves no temporary file when a file can't be written", async () => {
        const before = read("tokens.resolver.json");

        write("z.json", "{}\n");
        const ops = madeAndRead("more/extra.json", "z.json/extra.json");
        await expect(applyToDisk({ entry }, ops)).rejects.toThrow();
        expect(read("tokens.resolver.json")).toBe(before);
        expect(readdirSync(folder)).not.toContain("more");
        expect(readdirSync(folder).filter((file) => !file.endsWith(".json"))).toEqual([]);
    });

    it("deletes a file the edits delete", async () => {
        const gone: FileOp = { kind: "deleteFile", file: "motion.json", was: read("motion.json") };
        const result = await applyToDisk({ entry }, [gone]);

        expect(written(result)).toStrictEqual([]);
        expect(result).toMatchObject({ deleted: ["motion.json"] });
        expect(readdirSync(folder)).not.toContain("motion.json");
    });

    it("leaves no temporary file behind", async () => {
        await applyToDisk({ entry }, opsOf(setValue(demo, "radius.md", half)));

        expect(readdirSync(folder).filter((file) => !file.endsWith(".json"))).toEqual([]);
    });
});

function madeAndRead(...files: string[]): FileOp[] {
    const sources = ["resolutionOrder", 0, "sources"];
    const was = at(demo, "tokens.resolver.json", sources) as Json[];
    return [
        ...files.map((file): FileOp => ({ kind: "createFile", file, value: { extra: {} } })),
        {
            kind: "set",
            file: "tokens.resolver.json",
            path: sources,
            value: [...was, ...files.map((file) => ({ $ref: `./${file}` }))],
            was,
        },
    ];
}
