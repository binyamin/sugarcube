import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openFromMemory } from "../../src/index.js";
import { fileOnDisk, open } from "../../src/node.js";

const folder = join(import.meta.dirname, "../read/cases/every-combination/input");

describe("open from disk", () => {
    it("keeps each file's text by the Document's name for it, the entry by its file name", async () => {
        const project = await open(join(folder, "tokens.resolver.json"));
        expect(project.entry).toBe("tokens.resolver.json");
        expect(Object.keys(project.files)).toStrictEqual(project.doc.files);
        for (const file of project.doc.files) {
            expect(project.files[file]).toBe(readFileSync(join(folder, file), "utf8"));
        }
    });

    it("opens again from its own files and entry to the same Document", async () => {
        const project = await open(join(folder, "tokens.resolver.json"), { hexStringColors: true });
        expect(project.options).toStrictEqual({ hexStringColors: true });
        expect(
            openFromMemory(
                { files: project.files, entry: "tokens.resolver.json" },
                project.options,
            ),
        ).toStrictEqual(project);
    });
});

describe("fileOnDisk", () => {
    it("is where each file the Document names was read from", async () => {
        const entry = join(folder, "tokens.resolver.json");
        const project = await open(entry);
        for (const file of project.doc.files) {
            expect(readFileSync(fileOnDisk(entry, file), "utf8")).toBe(project.files[file]);
        }
    });

    it.for([
        {
            entry: "/work/tokens/tokens.resolver.json",
            file: "themes/dark.json",
            expected: "/work/tokens/themes/dark.json",
        },
        {
            entry: "/work/tokens/tokens.resolver.json",
            file: "../shared/base.json",
            expected: "/work/shared/base.json",
        },
        { entry: "/work/tokens.json", file: "tokens.json", expected: "/work/tokens.json" },
        {
            entry: "\\work\\tokens\\tokens.resolver.json",
            file: "dark.json",
            expected: "/work/tokens/dark.json",
        },
    ])("puts $file, read from $entry, at $expected", ({ entry, file, expected }) => {
        expect(fileOnDisk(entry, file)).toBe(expected);
    });

    it("is absolute for an entry given relative to where the process runs", () => {
        expect(fileOnDisk("tokens/tokens.resolver.json", "dark.json")).toBe(
            join(process.cwd(), "tokens/dark.json").replaceAll("\\", "/"),
        );
    });
});
