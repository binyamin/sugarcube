import { describe, expect, it } from "vitest";
import {
    defineGenerator,
    openFromMemory,
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
        expect(light?.replaces?.map(written)).toStrictEqual([color("#ffffff")]);
        expect(dark?.source.at.file).toBe("dark.json");
        expect(dark?.replaces?.map(({ file }) => file)).toStrictEqual(["base.json", "brand.json"]);
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
