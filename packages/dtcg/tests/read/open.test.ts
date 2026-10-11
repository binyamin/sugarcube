import { describe, expect, it } from "vitest";
import { type Project, open, openFromMemory } from "../../src/index.js";

const resolver = JSON.stringify({
    version: "2025.10",
    sets: { base: { sources: [{ $ref: "base.json" }, { $ref: "../shared/brand.json" }] } },
    resolutionOrder: [{ $ref: "#/sets/base" }],
});
const base = '{ "space": { "$type": "dimension", "$value": { "value": 4, "unit": "px" } } }';
const brand = '{ "color": { "$type": "color", "$value": "#e11d48" } }';
const dark = '{ "color": { "$type": "color", "$value": "#9f1239" } }';
const localResolver = JSON.stringify({
    version: "2025.10",
    sets: { base: { sources: [{ $ref: "base.json" }] } },
    resolutionOrder: [{ $ref: "#/sets/base" }],
});

const disk: Record<string, string> = {
    "tokens/design.resolver.json": resolver,
    "tokens/base.json": base,
    "shared/brand.json": brand,
};

const fromDisk = async (path: string) => disk[path] ?? Promise.reject(new Error("missing"));

function reopened({ files, entry, options }: Project): Project {
    return openFromMemory({ files, ...(entry !== undefined && { entry }) }, options);
}

describe("open", () => {
    it("keeps each file's text by the name the Document gives it", async () => {
        const project = await open("tokens/design.resolver.json", { readText: fromDisk });
        expect(project.doc.files).toStrictEqual([
            "design.resolver.json",
            "base.json",
            "../shared/brand.json",
        ]);
        expect(project.files).toStrictEqual({
            "design.resolver.json": resolver,
            "base.json": base,
            "../shared/brand.json": brand,
        });
    });

    it("names the entry as the Document does, so its text is among the files", async () => {
        const project = await open("tokens/design.resolver.json", { readText: fromDisk });
        expect(project.entry).toBe("design.resolver.json");
        expect(project.entry && project.files[project.entry]).toBe(resolver);
    });

    it("remembers the options it was read with, without the way it read files", async () => {
        const project = await open("tokens/design.resolver.json", {
            readText: fromDisk,
            hexStringColors: true,
        });
        expect(project.options).toStrictEqual({ hexStringColors: true });
        expect(project.doc.diagnostics).toStrictEqual([]);
    });

    it("leaves out a file that could not be read, as the Document reports it", async () => {
        const project = await open("tokens/design.resolver.json", {
            readText: async (path) =>
                path === "shared/brand.json"
                    ? Promise.reject(new Error("gone"))
                    : (disk[path] ?? ""),
        });
        expect(Object.keys(project.files)).toStrictEqual(["design.resolver.json", "base.json"]);
        expect(project.doc.diagnostics.map(({ kind }) => kind)).toStrictEqual(["file-not-found"]);
    });

    it("opens again from its own files, entry and options to the same Document", async () => {
        const project = await open("tokens/design.resolver.json", {
            readText: fromDisk,
            hexStringColors: true,
        });
        expect(reopened(project)).toStrictEqual(project);
    });
});

describe("openFromMemory", () => {
    it("keeps the text of each file the Document read, by the Document's name for it", () => {
        const project = openFromMemory({
            files: { ...disk, "tokens/unused.json": dark },
            entry: "tokens/design.resolver.json",
        });
        expect(project.entry).toBe("design.resolver.json");
        expect(project.files).toStrictEqual({
            "design.resolver.json": resolver,
            "base.json": base,
            "../shared/brand.json": brand,
        });
    });

    it("opens again from its own files and entry to the same Document", () => {
        const project = openFromMemory({ files: disk, entry: "tokens/design.resolver.json" });
        expect(reopened(project)).toStrictEqual(project);
    });

    it("opens one token file as the entry", () => {
        const project = openFromMemory({ files: { "base.json": base }, entry: "base.json" });
        expect(project.entry).toBe("base.json");
        expect(project.files).toStrictEqual({ "base.json": base });
        expect(reopened(project)).toStrictEqual(project);
    });

    it("has no entry when loose files are read as one set, and opens again to the same Document", () => {
        const project = openFromMemory({ files: { "base.json": base, "dark.json": dark } });
        expect(project.entry).toBeUndefined();
        expect(project.files).toStrictEqual({ "base.json": base, "dark.json": dark });
        expect(reopened(project)).toStrictEqual(project);
    });

    it("names the resolver it found among loose files as the entry", () => {
        const project = openFromMemory({
            files: { "base.json": base, "design.resolver.json": localResolver },
        });
        expect(project.entry).toBe("design.resolver.json");
        expect(project.files).toStrictEqual({
            "base.json": base,
            "design.resolver.json": localResolver,
        });
        expect(reopened(project)).toStrictEqual(project);
    });

    it("remembers the options it was read with", () => {
        const project = openFromMemory({ files: { "base.json": base } }, { hexStringColors: true });
        expect(project.options).toStrictEqual({ hexStringColors: true });
    });
});
