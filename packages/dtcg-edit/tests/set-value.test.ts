import { defineGenerator, token } from "@sugarcube-sh/dtcg";
import { describe, expect, it } from "vitest";
import { setDescription, setValue } from "../src/index.js";
import { demo, at, opsOf, committed, resolver, opened } from "./helpers.js";
describe("setValue, the shared value", () => {
    it("is one edit where the token is written, leaving dark's override alone", () => {
        const result = setValue(demo, "color.text.brand", "{color.brand.800}");

        expect(opsOf(result)).toEqual([
            {
                kind: "set",
                file: "color.json",
                path: ["color", "text", "brand", "$value"],
                value: "{color.brand.800}",
                was: "{color.brand.700}",
            },
        ]);
        const after = committed(demo, result);
        expect(token(after.doc, "color.text.brand")?.authored?.value).toBe("{color.brand.800}");
        expect(token(after.doc, "color.text.brand", { mode: "dark" })?.authored?.value).toBe(
            "{color.brand.300}",
        );
    });

    it("says which contexts see the change", () => {
        const brand = setValue(demo, "color.text.brand", "{color.brand.800}");
        const radius = setValue(demo, "radius.md", { value: 0.3, unit: "rem" });

        expect("ops" in brand && brand.alsoAffects).toEqual([{ mode: "light" }]);
        expect("ops" in radius && radius.alsoAffects).toEqual([
            { mode: "light" },
            { mode: "dark" },
        ]);
    });

    it("treats a context at its default as none", () => {
        expect(setValue(demo, "radius.md", 1, { context: { mode: "light" } })).toEqual(
            setValue(demo, "radius.md", 1),
        );
    });

    it("writes the value exactly as given, even one the read will call wrong", () => {
        const hex = committed(demo, setValue(demo, "color.brand.500", "#e11d48"));
        const words = committed(demo, setValue(demo, "radius.md", "sixteen pixels"));

        expect(at(hex, "color.json", ["color", "brand", "500", "$value"])).toBe("#e11d48");
        expect(at(words, "radius.json", ["radius", "md", "$value"])).toBe("sixteen pixels");
        expect(words.doc.diagnostics.some((each) => each.path === "radius.md")).toBe(true);
    });

    it("edits a shared value every context overrides, and says no context sees it", () => {
        const files = {
            "tokens.resolver.json": resolver([{ $ref: "./base.json" }], {
                light: [{ $ref: "./light.json" }],
                dark: [{ $ref: "./dark.json" }],
            }),
            "base.json": '{ "bg": { "$type": "color", "$value": "#ffffff" } }',
            "light.json": '{ "bg": { "$type": "color", "$value": "#fafafa" } }',
            "dark.json": '{ "bg": { "$type": "color", "$value": "#000000" } }',
        };

        expect(setValue(opened(files), "bg", "#eeeeee")).toEqual({
            ops: [
                {
                    kind: "set",
                    file: "base.json",
                    path: ["bg", "$value"],
                    value: "#eeeeee",
                    was: "#ffffff",
                },
            ],
            alsoAffects: [],
            moved: [],
        });
    });

    it("edits the shared value that wins, when two files every permutation reads write it", () => {
        const files = {
            "tokens.resolver.json": resolver([{ $ref: "./base.json" }, { $ref: "./brand.json" }]),
            "base.json": '{ "bg": { "$type": "color", "$value": "#ffffff" } }',
            "brand.json": '{ "bg": { "$type": "color", "$value": "#fafafa" } }',
        };

        expect(opsOf(setValue(opened(files), "bg", "#eeeeee"))).toEqual([
            {
                kind: "set",
                file: "brand.json",
                path: ["bg", "$value"],
                value: "#eeeeee",
                was: "#fafafa",
            },
        ]);
    });

    it("is refused for a shared value when only contexts write the token", () => {
        const files = {
            "tokens.resolver.json": resolver([{ $ref: "./base.json" }], {
                light: [],
                dark: [{ $ref: "./dark.json" }],
            }),
            "base.json": "{}",
            "dark.json": '{ "glow": { "$type": "color", "$value": "#000000" } }',
        };

        expect(setValue(opened(files), "glow", "#111111")).toEqual({
            refused: { kind: "no-shared-value", path: "glow", reason: expect.any(String) },
        });
    });

    it("names no context when the project has no modifiers", () => {
        const files = {
            "tokens.resolver.json": resolver([{ $ref: "./base.json" }]),
            "base.json": '{ "bg": { "$type": "color", "$value": "#ffffff" } }',
        };
        const result = setValue(opened(files), "bg", "#eeeeee");

        expect("ops" in result && result.alsoAffects).toEqual([]);
    });

    it("is refused for a token that doesn't exist", () => {
        expect(setValue(demo, "color.nope", "#000")).toEqual({
            refused: { kind: "not-found", path: "color.nope", reason: expect.any(String) },
        });
    });
});

describe("setValue, for one context", () => {
    const dark = { context: { mode: "dark" } };

    it("changes dark's own override, in dark's file only", () => {
        const result = setValue(demo, "color.text.brand", "{color.brand.200}", dark);

        expect("ops" in result && result.alsoAffects).toEqual([]);
        expect(opsOf(result)).toEqual([
            {
                kind: "set",
                file: "dark.json",
                path: ["color", "text", "brand", "$value"],
                value: "{color.brand.200}",
                was: "{color.brand.300}",
            },
        ]);
    });

    it("adds an override in the context's file when it has none yet", () => {
        const result = setValue(demo, "radius.md", { value: 0.5, unit: "rem" }, dark);

        expect(opsOf(result)).toEqual([
            {
                kind: "add",
                file: "dark.json",
                path: ["radius", "md"],
                value: { $value: { value: 0.5, unit: "rem" } },
            },
        ]);
        const after = committed(demo, result);
        expect(token(after.doc, "radius.md", { mode: "dark" })?.resolved).toEqual({
            value: 0.5,
            unit: "rem",
        });
        expect(token(after.doc, "radius.md")?.resolved).toEqual({ value: 0.25, unit: "rem" });
    });

    it("writes the type into a new override when the token declared its own", () => {
        const files = {
            "tokens.resolver.json": resolver([{ $ref: "./base.json" }], {
                light: [],
                dark: [{ $ref: "./dark.json" }],
            }),
            "base.json": '{ "bg": { "$type": "color", "$value": "#ffffff" } }',
            "dark.json": "{}",
        };

        expect(opsOf(setValue(opened(files), "bg", "#000000", dark))).toEqual([
            {
                kind: "add",
                file: "dark.json",
                path: ["bg"],
                value: { $type: "color", $value: "#000000" },
            },
        ]);
    });

    it("keeps the token's own description, deprecation and extensions in a new override", () => {
        const bg = {
            $type: "color",
            $value: "#ffffff",
            $description: "The page.",
            $deprecated: "Use surface.",
            $extensions: { "com.example": { role: "page" } },
        };
        const files = {
            "tokens.resolver.json": resolver([{ $ref: "./base.json" }], {
                light: [],
                dark: [{ $ref: "./dark.json" }],
            }),
            "base.json": JSON.stringify({ bg }),
            "dark.json": "{}",
        };
        const project = opened(files);
        const result = setValue(project, "bg", "#000000", dark);

        expect(opsOf(result)).toEqual([
            { kind: "add", file: "dark.json", path: ["bg"], value: { ...bg, $value: "#000000" } },
        ]);
        expect(token(committed(project, result).doc, "bg", { mode: "dark" })).toMatchObject({
            description: "The page.",
            deprecated: "Use surface.",
            extensions: { "com.example": { role: "page" } },
        });
    });

    it("leaves out a deprecation the token takes from its group, which still reaches it", () => {
        const files = {
            "tokens.resolver.json": resolver([{ $ref: "./base.json" }], {
                light: [],
                dark: [{ $ref: "./dark.json" }],
            }),
            "base.json": JSON.stringify({
                old: { $type: "color", $deprecated: true, bg: { $value: "#ffffff" } },
            }),
            "dark.json": "{}",
        };
        const project = opened(files);
        const result = setValue(project, "old.bg", "#000000", dark);

        expect(opsOf(result)).toEqual([
            { kind: "add", file: "dark.json", path: ["old", "bg"], value: { $value: "#000000" } },
        ]);
        expect(token(committed(project, result).doc, "old.bg", { mode: "dark" })?.deprecated).toBe(
            true,
        );
    });

    it("asks which file when the context reads several, and takes the answer", () => {
        const files = {
            "tokens.resolver.json": resolver([{ $ref: "./base.json" }], {
                light: [],
                dark: [{ $ref: "./dark.json" }, { $ref: "./dark-extra.json" }],
            }),
            "base.json": '{ "bg": { "$type": "color", "$value": "#ffffff" } }',
            "dark.json": "{}",
            "dark-extra.json": "{}",
        };
        const project = opened(files);

        expect(setValue(project, "bg", "#000000", dark)).toEqual({
            decision: {
                kind: "placement",
                path: "bg",
                candidates: ["dark.json", "dark-extra.json"],
            },
        });
        expect(
            opsOf(setValue(project, "bg", "#000000", { ...dark, place: "dark-extra.json" })),
        ).toEqual([
            {
                kind: "add",
                file: "dark-extra.json",
                path: ["bg"],
                value: { $type: "color", $value: "#000000" },
            },
        ]);
    });

    it("writes into the context's file that declares the token's group, without asking", () => {
        const files = {
            "tokens.resolver.json": resolver([{ $ref: "./base.json" }], {
                light: [],
                dark: [{ $ref: "./dark.json" }, { $ref: "./dark-colors.json" }],
            }),
            "base.json": '{ "color": { "$type": "color", "bg": { "$value": "#ffffff" } } }',
            "dark.json": "{}",
            "dark-colors.json": '{ "color": { "fg": { "$value": "#ffffff" } } }',
        };

        expect(opsOf(setValue(opened(files), "color.bg", "#000000", dark))).toEqual([
            {
                kind: "add",
                file: "dark-colors.json",
                path: ["color", "bg"],
                value: { $value: "#000000" },
            },
        ]);
    });

    it("is refused when a file read later would win over the new override", () => {
        const files = {
            "tokens.resolver.json": JSON.stringify({
                version: "2025.10",
                resolutionOrder: [
                    { type: "set", name: "base", sources: [{ $ref: "./base.json" }] },
                    {
                        type: "modifier",
                        name: "mode",
                        default: "light",
                        contexts: { light: [], dark: [{ $ref: "./dark.json" }] },
                    },
                    {
                        type: "modifier",
                        name: "brand",
                        default: "a",
                        contexts: { a: [{ $ref: "./a.json" }], b: [] },
                    },
                ],
            }),
            "base.json": '{ "bg": { "$type": "color", "$value": "#ffffff" } }',
            "dark.json": "{}",
            "a.json": '{ "bg": { "$type": "color", "$value": "#eeeeee" } }',
        };

        expect(setValue(opened(files), "bg", "#000000", dark)).toEqual({
            refused: {
                kind: "hidden-by-later-file",
                path: "bg",
                context: { mode: "dark" },
                file: "a.json",
                reason: expect.any(String),
            },
        });
    });

    it("is refused for a context the resolver doesn't have", () => {
        expect(setValue(demo, "radius.md", 1, { context: { mode: "dim" } })).toEqual({
            refused: {
                kind: "no-permutation",
                context: { mode: "dim" },
                why: "unknown-context",
                reason: expect.any(String),
            },
        });
    });

    it("is refused for two contexts at once", () => {
        const files = {
            "tokens.resolver.json": JSON.stringify({
                version: "2025.10",
                resolutionOrder: [
                    { type: "set", name: "base", sources: [{ $ref: "./base.json" }] },
                    {
                        type: "modifier",
                        name: "mode",
                        default: "light",
                        contexts: { light: [], dark: [] },
                    },
                    { type: "modifier", name: "brand", default: "a", contexts: { a: [], b: [] } },
                ],
            }),
            "base.json": '{ "bg": { "$type": "color", "$value": "#ffffff" } }',
        };

        expect(
            setValue(opened(files), "bg", "#000000", { context: { mode: "dark", brand: "b" } }),
        ).toEqual({
            refused: {
                kind: "several-contexts",
                context: { mode: "dark", brand: "b" },
                reason: expect.any(String),
            },
        });
    });

    it("is refused when the context reads no file of its own", () => {
        const files = {
            "tokens.resolver.json": resolver([{ $ref: "./base.json" }], { light: [], dark: [] }),
            "base.json": '{ "bg": { "$type": "color", "$value": "#ffffff" } }',
        };

        expect(setValue(opened(files), "bg", "#000000", dark)).toEqual({
            refused: {
                kind: "no-file-for-context",
                path: "bg",
                context: { mode: "dark" },
                reason: expect.any(String),
            },
        });
    });
});

describe("setValue, what it can't change", () => {
    it("changes a token read from part of a file where the file writes it", () => {
        const files = {
            "tokens.resolver.json": resolver([{ $ref: "./all.json#/tokens" }]),
            "all.json": '{ "tokens": { "bg": { "$type": "color", "$value": "#ffffff" } } }',
        };

        expect(opsOf(setValue(opened(files), "bg", "#000000"))).toEqual([
            {
                kind: "set",
                file: "all.json",
                path: ["tokens", "bg", "$value"],
                value: "#000000",
                was: "#ffffff",
            },
        ]);
    });

    it("adds no override into a file the context reads only part of", () => {
        const files = {
            "tokens.resolver.json": resolver([{ $ref: "./base.json" }], {
                light: [],
                dark: [{ $ref: "./dark.json#/tokens" }],
            }),
            "base.json": '{ "bg": { "$type": "color", "$value": "#ffffff" } }',
            "dark.json": '{ "tokens": {} }',
        };

        expect(setValue(opened(files), "bg", "#000000", { context: { mode: "dark" } })).toEqual({
            refused: {
                kind: "no-file-for-context",
                path: "bg",
                context: { mode: "dark" },
                reason: expect.any(String),
            },
        });
    });

    it("is refused for a token a generator makes, naming the group whose extension makes it", () => {
        const steps = defineGenerator({
            extension: ["com.example", "steps"],
            generate: (_group, count) => ({
                ok: true,
                value: Array.from({ length: Number(count) }, (_, i) => ({
                    name: String(i + 1),
                    $value: { value: i + 1, unit: "rem" },
                })),
            }),
        });
        const files = {
            "tokens.resolver.json": resolver([{ $ref: "./space.json" }]),
            "space.json": JSON.stringify({
                space: { $type: "dimension", $extensions: { "com.example": { steps: 2 } } },
            }),
        };

        expect(setValue(opened(files, { generators: [steps] }), "space.1", 4)).toEqual({
            refused: {
                kind: "generated",
                path: "space.1",
                from: "space",
                extension: ["com.example", "steps"],
                reason: expect.any(String),
            },
        });
    });

    it("is refused for a token a group inherits", () => {
        const files = {
            "tokens.resolver.json": resolver([{ $ref: "./base.json" }]),
            "base.json": JSON.stringify({
                button: { $type: "color", bg: { $value: "#ffffff" } },
                danger: { $extends: "{button}" },
            }),
        };

        expect(setValue(opened(files), "danger.bg", "#ff0000")).toEqual({
            refused: {
                kind: "inherited",
                path: "danger.bg",
                from: "button",
                reason: expect.any(String),
            },
        });
    });
});

describe("setDescription", () => {
    it("changes a token's description", () => {
        const result = setDescription(demo, "color.brand.500", "The anchor.");

        expect(opsOf(result)).toEqual([
            {
                kind: "set",
                file: "color.json",
                path: ["color", "brand", "500", "$description"],
                value: "The anchor.",
                was: at(demo, "color.json", ["color", "brand", "500", "$description"]),
            },
        ]);
    });

    it("changes it in every file that writes the token, so every context keeps the same one", () => {
        const files = {
            "tokens.resolver.json": resolver([{ $ref: "./base.json" }], {
                light: [],
                dark: [{ $ref: "./dark.json" }],
                dim: [{ $ref: "./dim.json" }],
            }),
            "base.json":
                '{ "bg": { "$type": "color", "$value": "#ffffff", "$description": "Old." } }',
            "dark.json":
                '{ "bg": { "$type": "color", "$value": "#000000", "$description": "Old." } }',
            "dim.json": '{ "bg": { "$type": "color", "$value": "#333333" } }',
        };
        const project = opened(files);
        const result = setDescription(project, "bg", "The page.");

        expect(opsOf(result)).toEqual([
            {
                kind: "set",
                file: "base.json",
                path: ["bg", "$description"],
                value: "The page.",
                was: "Old.",
            },
            {
                kind: "set",
                file: "dark.json",
                path: ["bg", "$description"],
                value: "The page.",
                was: "Old.",
            },
            { kind: "add", file: "dim.json", path: ["bg", "$description"], value: "The page." },
        ]);
        const after = committed(project, result).doc;
        for (const mode of ["light", "dark", "dim"]) {
            expect(token(after, "bg", { mode })?.description).toBe("The page.");
        }
    });

    it("changes the description of a token only one context writes", () => {
        const files = {
            "tokens.resolver.json": resolver([{ $ref: "./base.json" }], {
                light: [],
                dark: [{ $ref: "./dark.json" }],
            }),
            "base.json": "{}",
            "dark.json": '{ "glow": { "$type": "color", "$value": "#ffffff" } }',
        };

        expect(opsOf(setDescription(opened(files), "glow", "Halo."))).toEqual([
            { kind: "add", file: "dark.json", path: ["glow", "$description"], value: "Halo." },
        ]);
    });

    it("adds one to a token that has none", () => {
        const after = committed(demo, setDescription(demo, "color.brand.600", "Hover."));

        expect(token(after.doc, "color.brand.600")?.description).toBe("Hover.");
    });

    it("changes a group's description where the group writes it", () => {
        const after = committed(demo, setDescription(demo, "color.brand", "The house colour."));

        expect(at(after, "color.json", ["color", "brand", "$description"])).toBe(
            "The house colour.",
        );
    });

    it("changes a group's description in the file that writes it, when the group is in several", () => {
        const files = {
            "tokens.resolver.json": resolver([{ $ref: "./base.json" }, { $ref: "./more.json" }]),
            "base.json": '{ "color": { "$type": "color", "a": { "$value": "#ffffff" } } }',
            "more.json": '{ "color": { "$description": "Old.", "b": { "$value": "#000000" } } }',
        };

        expect(setDescription(opened(files), "color", "New.")).toEqual({
            ops: [
                {
                    kind: "set",
                    file: "more.json",
                    path: ["color", "$description"],
                    value: "New.",
                    was: "Old.",
                },
            ],
            alsoAffects: [],
            moved: [],
        });
    });

    it("removes one with null, and does nothing when there is none", () => {
        const after = committed(demo, setDescription(demo, "color.brand.500", null));

        expect(token(after.doc, "color.brand.500")?.description).toBeUndefined();
        expect(opsOf(setDescription(demo, "color.brand.600", null))).toEqual([]);
    });

    it("is refused for a path that is neither a token nor a group", () => {
        expect(setDescription(demo, "color.nope", "x")).toEqual({
            refused: { kind: "not-found", path: "color.nope", reason: expect.any(String) },
        });
    });
});
