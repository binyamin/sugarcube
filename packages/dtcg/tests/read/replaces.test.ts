import { describe, expect, it } from "vitest";
import {
    defineGenerator,
    group,
    openFromMemory,
    permutation,
    readFromMemory,
    token,
    type Span,
} from "../../src/index.js";

const color = (hex: string) => `{ "$type": "color", "$value": "${hex}" }`;

const resolver = JSON.stringify({
    version: "2025.10",
    resolutionOrder: [
        { type: "set", name: "base", sources: [{ $ref: "./base.json" }, { $ref: "./brand.json" }] },
        {
            type: "modifier",
            name: "mode",
            default: "light",
            contexts: { light: [], dark: [{ $ref: "./dark.json" }] },
        },
    ],
});

const files = {
    "tokens.resolver.json": resolver,
    "base.json": `{ "bg": ${color("#ffffff")}, "fg": ${color("#000000")} }`,
    "brand.json": `{ "bg": ${color("#fafafa")} }`,
    "dark.json": `{ "bg": ${color("#111111")} }`,
};
const doc = readFromMemory({ files, entry: "tokens.resolver.json" });

const written = (span: Span) =>
    files[span.file as keyof typeof files].slice(span.offset, span.offset + span.length);

describe("replaces on a token", () => {
    it("lists the places earlier sources write it, in order, which its source replaces", () => {
        const light = token(doc, "bg");
        const dark = token(doc, "bg", { mode: "dark" });

        expect(light?.source.at.file).toBe("brand.json");
        expect(light?.replaces?.map(({ at }) => written(at))).toStrictEqual([color("#ffffff")]);
        expect(dark?.source.at.file).toBe("dark.json");
        expect(dark?.replaces?.map(({ at }) => at.file)).toStrictEqual(["base.json", "brand.json"]);
    });

    it("gives a group written in two files both places, each with the source that writes it", () => {
        const twice = readFromMemory({
            files: {
                ...files,
                "base.json": `{ "brand": { "a": ${color("#000000")} } }`,
                "brand.json": `{ "brand": { "b": ${color("#ffffff")} } }`,
            },
            entry: "tokens.resolver.json",
        });
        const sources = twice.permutations[0]?.sources ?? [];
        const declared = group(twice, "brand")?.declaredIn ?? [];

        expect(declared.map(({ index }) => sources[index]?.file)).toStrictEqual([
            "base.json",
            "brand.json",
        ]);
        expect(declared.map(({ at }) => at.file)).toStrictEqual(["base.json", "brand.json"]);
    });

    it("says which of the permutation's sources writes each place", () => {
        const sources = permutation(doc, { mode: "dark" })?.sources ?? [];
        const dark = token(doc, "bg", { mode: "dark" });
        const replaced = dark?.replaces?.map(({ index }) => sources[index]);

        expect(replaced?.map((source) => source?.file)).toStrictEqual(["base.json", "brand.json"]);
        expect(sources[dark?.source.index ?? -1]?.from).toStrictEqual({
            modifier: "mode",
            context: "dark",
            sets: [],
        });
    });

    it("is absent for a token written once", () => {
        expect(token(doc, "fg")).not.toHaveProperty("replaces");
    });

    it("is absent for a token only inherited, even when the group it comes from replaced one", () => {
        const extended = readFromMemory({
            files: {
                "tokens.resolver.json": JSON.stringify({
                    version: "2025.10",
                    resolutionOrder: [
                        {
                            type: "set",
                            name: "base",
                            sources: [{ $ref: "./a.json" }, { $ref: "./b.json" }],
                        },
                    ],
                }),
                "a.json": JSON.stringify({ button: { $type: "color", bg: { $value: "#ffffff" } } }),
                "b.json": JSON.stringify({
                    button: { bg: { $value: "#eeeeee" } },
                    danger: { $extends: "{button}" },
                }),
            },
            entry: "tokens.resolver.json",
        });

        expect(token(extended, "button.bg")?.replaces).toHaveLength(1);
        expect(token(extended, "danger.bg")).not.toHaveProperty("replaces");
    });

    it("is absent for a token a generator adds, which no file writes", () => {
        const steps = defineGenerator({
            extension: ["com.example", "steps"],
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

        expect(token(generated, "space.1")).not.toHaveProperty("replaces");
        expect(token(generated, "space.1")?.generated).toStrictEqual({
            from: "space",
            extension: ["com.example", "steps"],
        });
    });
});

describe("openFromMemory", () => {
    it("takes an entry left undefined as no entry", () => {
        const loose = { "tokens.json": `{ "bg": ${color("#ffffff")} }` };
        const entry: string | undefined = undefined;

        expect(openFromMemory({ files: loose, entry }).doc.files).toStrictEqual(["tokens.json"]);
    });
});

describe("a source written in the resolver", () => {
    it("is part of the resolver, so it has a pointer to where its tokens sit", () => {
        const inline = readFromMemory({
            files: {
                "tokens.resolver.json": JSON.stringify({
                    version: "2025.10",
                    resolutionOrder: [
                        {
                            type: "set",
                            name: "base",
                            sources: [
                                { $ref: "./base.json" },
                                { bg: { $type: "color", $value: "#fff" } },
                            ],
                        },
                    ],
                }),
                "base.json": "{}",
            },
            entry: "tokens.resolver.json",
        });

        expect(inline.permutations[0]?.sources).toStrictEqual([
            { file: "base.json", from: { sets: ["base"] }, readBy: "everyone" },
            {
                file: "tokens.resolver.json",
                pointer: "#/resolutionOrder/0/sources/1",
                from: { sets: ["base"] },
                readBy: "everyone",
            },
        ]);
    });
});
