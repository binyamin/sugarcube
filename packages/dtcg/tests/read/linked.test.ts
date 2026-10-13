import { describe, expect, it } from "vitest";
import { type DesignSystem, defineGenerator, readFromMemory } from "../../src/index.js";

const color = (red: number) => ({ $value: { colorSpace: "srgb", components: [red, 0, 0] } });

function oneFile(tokens: unknown): DesignSystem {
    return readFromMemory({ files: { "tokens.json": JSON.stringify(tokens) } });
}

const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

describe("a token's group", () => {
    const doc = oneFile({
        color: { $type: "color", bg: color(1), brand: { "500": color(0.5), "$root": color(0.6) } },
        gap: { $type: "number", $value: 2 },
    });

    it("is the group it is written in", () => {
        expect(doc.permutation().token("color.bg")?.group).toBe(doc.permutation().group("color"));
        expect(doc.permutation().token("color.brand.500")?.group).toBe(
            doc.permutation().group("color.brand"),
        );
    });

    it("is the group whose root token it is (Format 6.2)", () => {
        expect(doc.permutation().token("color.brand.$root")?.group).toBe(
            doc.permutation().group("color.brand"),
        );
    });

    it("is absent for a token at the top level", () => {
        expect(doc.permutation().token("gap")?.group).toBeUndefined();
    });

    it("is the group that takes it through $extends", () => {
        const extending = oneFile({
            button: { $type: "number", pad: { $value: 1 } },
            primary: { $extends: "{button}" },
        });
        expect(extending.permutation().token("primary.pad")?.group).toBe(
            extending.permutation().group("primary"),
        );
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
        expect(generated.permutation().token("space.1")?.group).toBe(
            generated.permutation().group("space"),
        );
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
        const dark = themed.permutation({ mode: "dark" });
        const light = themed.permutation({ mode: "light" });
        const darkBg = dark.token("color.bg");
        expect(darkBg?.group).toBe(dark.group("color"));
        expect(darkBg?.group).not.toBe(light.group("color"));
    });
});

describe("a group's group", () => {
    const doc = oneFile({ color: { $type: "color", brand: { "500": color(0.5) } } });

    it("is the group it is in, its parent group (Format 6.7.3)", () => {
        expect(doc.permutation().group("color.brand")?.group).toBe(
            doc.permutation().group("color"),
        );
    });

    it("is absent for a group at the top level", () => {
        expect(doc.permutation().group("color")?.group).toBeUndefined();
    });

    it("walks up from a token to the top level", () => {
        const trail: string[] = [];
        for (let at = doc.permutation().token("color.brand.500")?.group; at; at = at.group)
            trail.push(at.path);
        expect(trail).toStrictEqual(["color.brand", "color"]);
    });
});

describe("a group's root token", () => {
    const doc = oneFile({
        color: { $type: "color", brand: { "500": color(0.5), "$root": color(0.6) }, bg: color(1) },
    });

    it("is the token named $root in it (Format 6.2)", () => {
        expect(doc.permutation().group("color.brand")?.rootToken).toBe(
            doc.permutation().token("color.brand.$root"),
        );
    });

    it("is absent when the group has none", () => {
        expect(doc.permutation().group("color")?.rootToken).toBeUndefined();
    });
});

describe("kind", () => {
    const doc = oneFile({ color: { $type: "color", bg: color(1) } });

    it("says a token is a token and a group a group (Format 6.1)", () => {
        expect(doc.permutation().token("color.bg")?.kind).toBe("token");
        expect(doc.permutation().group("color")?.kind).toBe("group");
    });

    it("tells a group's children apart", () => {
        const nested = oneFile({ color: { $type: "color", bg: color(1), brand: {} } });
        const kinds = nested
            .permutation()
            .group("color")
            ?.children.map(({ kind }) => kind);
        expect(kinds).toStrictEqual(["token", "group"]);
    });
});

describe("the plain form", () => {
    const doc = oneFile({
        color: { $type: "color", bg: color(1), brand: { "500": color(0.5), "$root": color(0.6) } },
        gap: { $type: "number", $value: 2 },
    });
    const base = doc.permutation();

    it("is what JSON.stringify writes, though the links go in circles", () => {
        expect(() => JSON.stringify(doc)).not.toThrow();
    });

    it("writes a token without its group, permutation or kind", () => {
        const bg = doc.permutation().token("color.bg");
        const written = plain(bg);
        expect(written).not.toHaveProperty("group");
        expect(written).not.toHaveProperty("kind");
        expect(written).not.toHaveProperty("permutation");
        expect(written).toStrictEqual(plain({ ...bg, group: undefined, permutation: undefined }));
    });

    it("writes a group's children as their paths, without its root token or kind", () => {
        const written = plain(doc.permutation().group("color.brand"));
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
        expect(written.permutations[0].tokens[0]).toStrictEqual(
            plain(doc.permutation().token("color.bg")),
        );
        expect(written.permutations[0].groups[0].children).toStrictEqual([
            "color.bg",
            "color.brand",
        ]);
    });
});
