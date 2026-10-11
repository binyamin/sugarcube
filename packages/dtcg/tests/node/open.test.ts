import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openFromMemory } from "../../src/index.js";
import { open } from "../../src/node.js";

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
