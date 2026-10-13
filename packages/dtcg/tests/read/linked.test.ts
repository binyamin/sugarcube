import { describe, expect, it } from "vitest";
import {
    type Document,
    defaultPermutation,
    defineGenerator,
    group,
    permutation,
    readFromMemory,
    token,
} from "../../src/index.js";

const color = (red: number) => ({ $value: { colorSpace: "srgb", components: [red, 0, 0] } });

function oneFile(tokens: unknown): Document {
    return readFromMemory({ files: { "tokens.json": JSON.stringify(tokens) } });
}

const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

describe("a token's group", () => {
    const doc = oneFile({
        color: { $type: "color", bg: color(1), brand: { "500": color(0.5), "$root": color(0.6) } },
        gap: { $type: "number", $value: 2 },
    });

    it("is the group it is written in", () => {
        expect(token(doc, "color.bg")?.group).toBe(group(doc, "color"));
        expect(token(doc, "color.brand.500")?.group).toBe(group(doc, "color.brand"));
    });

    it("is the group whose root token it is (Format 6.2)", () => {
        expect(token(doc, "color.brand.$root")?.group).toBe(group(doc, "color.brand"));
    });

    it("is absent for a token at the top level", () => {
        expect(token(doc, "gap")?.group).toBeUndefined();
    });

    it("is the group that takes it through $extends", () => {
        const extending = oneFile({
            button: { $type: "number", pad: { $value: 1 } },
            primary: { $extends: "{button}" },
        });
        expect(token(extending, "primary.pad")?.group).toBe(group(extending, "primary"));
    });

    it("is the group a generator adds it to", () => {
        const steps = defineGenerator({
            extension: ["com.example", "steps"],
            messages: {},
            generate: () => ({ ok: true, value: [{ name: "1", $value: 1 }] }),
        });
        const generated = readFromMemory(
            {
                files: {
                    "tokens.json": JSON.stringify({
                        space: { $type: "number", $extensions: { "com.example": { steps: 1 } } },
                    }),
                },
            },
            { generators: [steps] },
        );
        expect(token(generated, "space.1")?.group).toBe(group(generated, "space"));
    });

    it("is its own permutation's group", () => {
        const themed = readFromMemory({
            files: {
                "tokens.resolver.json": JSON.stringify({
                    version: "2025.10",
                    resolutionOrder: [
                        { type: "set", name: "base", sources: [{ $ref: "base.json" }] },
                        {
                            type: "modifier",
                            name: "mode",
                            default: "light",
                            contexts: { light: [], dark: [{ $ref: "dark.json" }] },
                        },
                    ],
                }),
                "base.json": JSON.stringify({ color: { $type: "color", bg: color(1) } }),
                "dark.json": JSON.stringify({ color: { bg: color(0) } }),
            },
        });
        const dark = permutation(themed, { mode: "dark" });
        const light = permutation(themed, { mode: "light" });
        const darkBg = dark && token(dark, "color.bg");
        expect(darkBg?.group).toBe(dark && group(dark, "color"));
        expect(darkBg?.group).not.toBe(light && group(light, "color"));
    });
});

describe("a group's group", () => {
    const doc = oneFile({ color: { $type: "color", brand: { "500": color(0.5) } } });

    it("is the group it is in, its parent group (Format 6.7.3)", () => {
        expect(group(doc, "color.brand")?.group).toBe(group(doc, "color"));
    });

    it("is absent for a group at the top level", () => {
        expect(group(doc, "color")?.group).toBeUndefined();
    });

    it("walks up from a token to the top level", () => {
        const trail: string[] = [];
        for (let at = token(doc, "color.brand.500")?.group; at; at = at.group) trail.push(at.path);
        expect(trail).toStrictEqual(["color.brand", "color"]);
    });
});

describe("a group's root token", () => {
    const doc = oneFile({
        color: { $type: "color", brand: { "500": color(0.5), "$root": color(0.6) }, bg: color(1) },
    });

    it("is the token named $root in it (Format 6.2)", () => {
        expect(group(doc, "color.brand")?.rootToken).toBe(token(doc, "color.brand.$root"));
    });

    it("is absent when the group has none", () => {
        expect(group(doc, "color")?.rootToken).toBeUndefined();
    });
});

describe("kind", () => {
    const doc = oneFile({ color: { $type: "color", bg: color(1) } });

    it("says a token is a token and a group a group (Format 6.1)", () => {
        expect(token(doc, "color.bg")?.kind).toBe("token");
        expect(group(doc, "color")?.kind).toBe("group");
    });

    it("tells a group's children apart", () => {
        const nested = oneFile({ color: { $type: "color", bg: color(1), brand: {} } });
        const kinds = group(nested, "color")?.children.map(({ kind }) => kind);
        expect(kinds).toStrictEqual(["token", "group"]);
    });
});

describe("the plain form", () => {
    const doc = oneFile({
        color: { $type: "color", bg: color(1), brand: { "500": color(0.5), "$root": color(0.6) } },
        gap: { $type: "number", $value: 2 },
    });
    const base = defaultPermutation(doc);

    it("is what JSON.stringify writes, though the links go in circles", () => {
        expect(() => JSON.stringify(doc)).not.toThrow();
    });

    it("writes a token without its group, permutation or kind", () => {
        const bg = token(doc, "color.bg");
        const written = plain(bg);
        expect(written).not.toHaveProperty("group");
        expect(written).not.toHaveProperty("kind");
        expect(written).not.toHaveProperty("permutation");
        expect(written).toStrictEqual(plain({ ...bg, group: undefined, permutation: undefined }));
    });

    it("writes a group's children as their paths, without its root token or kind", () => {
        const written = plain(group(doc, "color.brand"));
        expect(written.children).toStrictEqual(["color.brand.500", "color.brand.$root"]);
        expect(written).not.toHaveProperty("rootToken");
        expect(written).not.toHaveProperty("group");
        expect(written).not.toHaveProperty("kind");
    });

    it("writes the top level's children on the permutation, as their paths", () => {
        const written = plain(base);
        expect(written.children).toStrictEqual(["color", "gap"]);
        expect(written.root).not.toHaveProperty("children");
    });

    it("writes every permutation's tokens and groups the same way", () => {
        const written = plain(doc);
        expect(written.permutations[0].tokens[0]).toStrictEqual(plain(token(doc, "color.bg")));
        expect(written.permutations[0].groups[0].children).toStrictEqual([
            "color.bg",
            "color.brand",
        ]);
    });
});
