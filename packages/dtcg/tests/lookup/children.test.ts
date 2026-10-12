import { describe, expect, it } from "vitest";
import {
    type Document,
    defaultPermutation,
    defineGenerator,
    group,
    permutation,
    readFromMemory,
} from "../../src/index.js";

const color = (red: number) => ({ $value: { colorSpace: "srgb", components: [red, 0, 0] } });

function oneFile(tokens: unknown): Document {
    return readFromMemory({ files: { "tokens.json": JSON.stringify(tokens) } });
}

describe("a group's children", () => {
    const doc = oneFile({
        color: {
            $type: "color",
            bg: color(1),
            brand: { "500": color(0.5), "$root": color(0.6) },
            text: color(0),
            raw: {},
        },
        space: { $type: "number", sm: { $value: 1 } },
    });

    it("are the paths directly inside it, tokens and groups together, in the order the file writes them", () => {
        expect(group(doc, "color")?.children).toStrictEqual([
            "color.bg",
            "color.brand",
            "color.text",
            "color.raw",
        ]);
    });

    it("include a group's own $root token where it is written", () => {
        expect(group(doc, "color.brand")?.children).toStrictEqual([
            "color.brand.500",
            "color.brand.$root",
        ]);
    });

    it("are empty for an empty group", () => {
        expect(group(doc, "color.raw")?.children).toStrictEqual([]);
    });

    it("leave out a token the read could not keep", () => {
        const untyped = oneFile({
            loose: { kept: { $type: "number", $value: 1 }, lost: { $value: 2 } },
        });
        expect(group(untyped, "loose")?.children).toStrictEqual(["loose.kept"]);
    });
});

describe("the top level", () => {
    const doc = oneFile({
        color: { $type: "number", a: { $value: 1 } },
        gap: { $type: "number", $value: 2 },
    });
    const base = defaultPermutation(doc);

    it("holds what the file writes at the top, in order", () => {
        expect(base?.root.children).toStrictEqual(["color", "gap"]);
    });

    it('has no path, so nothing reaches it by one: group(…, "") is the group named ""', () => {
        expect(base && "path" in base.root).toBe(false);
        expect(group(doc, "")).toBeUndefined();
    });

    it("is not among the permutation's groups", () => {
        expect(base?.groups.map(({ path }) => path)).toStrictEqual(["color"]);
    });

    it("keeps a $type written at the top of the file", () => {
        const typed = oneFile({ $type: "number", gap: { $value: 2 } });
        expect(defaultPermutation(typed)?.root.type).toBe("number");
    });
});

describe("across files and themes", () => {
    const resolver = {
        version: "2025.10",
        resolutionOrder: [
            { type: "set", name: "base", sources: [{ $ref: "a.json" }, { $ref: "b.json" }] },
            {
                type: "modifier",
                name: "mode",
                default: "light",
                contexts: { light: [], dark: [{ $ref: "dark.json" }] },
            },
        ],
    };
    const doc = readFromMemory({
        files: {
            "tokens.resolver.json": JSON.stringify(resolver),
            "a.json": JSON.stringify({
                color: { $type: "color", bg: color(1) },
                size: { $type: "number", s: { $value: 1 } },
            }),
            "b.json": JSON.stringify({
                color: { text: color(0) },
                gap: { $type: "number", $value: 2 },
            }),
            "dark.json": JSON.stringify({ color: { glow: color(0.2), bg: color(0) } }),
        },
        entry: "tokens.resolver.json",
    });

    it("put what a later file adds to a group at the end of its children", () => {
        expect(group(doc, "color")?.children).toStrictEqual(["color.bg", "color.text"]);
    });

    it("list the top level across the files, in the order they are read", () => {
        expect(defaultPermutation(doc)?.root.children).toStrictEqual(["color", "size", "gap"]);
    });

    it("are each permutation's own: dark's group has dark's token, light's doesn't", () => {
        expect(group(doc, "color", { mode: "dark" })?.children).toStrictEqual([
            "color.bg",
            "color.text",
            "color.glow",
        ]);
        expect(group(doc, "color", { mode: "light" })?.children).not.toContain("color.glow");
    });

    it("put an override where the token was first written", () => {
        const dark = permutation(doc, { mode: "dark" });
        expect(dark && group(dark, "color")?.children[0]).toBe("color.bg");
    });
});

describe("tokens that are not written", () => {
    it("put tokens a group takes through $extends at the end of its children", () => {
        const doc = oneFile({
            button: { $type: "number", pad: { $value: 1 }, gap: { $value: 2 } },
            primary: { $extends: "{button}", own: { $value: 3 }, pad: { $value: 4 } },
        });
        expect(group(doc, "primary")?.children).toStrictEqual([
            "primary.own",
            "primary.pad",
            "primary.gap",
        ]);
    });

    it("put tokens a generator makes at the end of their group, as the token list does", () => {
        const steps = defineGenerator({
            extension: ["com.example", "steps"],
            messages: {},
            generate: () => ({
                ok: true,
                value: ["3", "2", "1"].map((name) => ({ name, $value: Number(name) })),
            }),
        });
        const doc = readFromMemory(
            {
                files: {
                    "tokens.json": JSON.stringify({
                        space: {
                            "$type": "number",
                            "$extensions": { "com.example": { steps: 3 } },
                            "2": { $value: 20 },
                            "sub": {},
                        },
                    }),
                },
            },
            { generators: [steps] },
        );
        const tokenOrder = defaultPermutation(doc)
            ?.tokens.map(({ path }) => path)
            .filter((path) => path.startsWith("space."));
        const children = group(doc, "space")?.children;
        expect(children?.filter((path) => path !== "space.sub")).toStrictEqual(tokenOrder);
        expect(children?.indexOf("space.sub")).toBe(1);
    });
});

describe('a group named ""', () => {
    const doc = oneFile({
        "": { $type: "number", x: { $value: 1 } },
        "size": { $type: "number", $value: 2 },
    });
    const base = defaultPermutation(doc);

    it("is a child of the top level, and holds its own tokens, never the top level's (Format 5.1)", () => {
        expect(base?.root.children).toStrictEqual(["", "size"]);
        expect(base?.groups.find(({ path }) => path === "")?.children).toStrictEqual([".x"]);
        expect(group(doc, "")?.children).toStrictEqual([".x"]);
    });
});
