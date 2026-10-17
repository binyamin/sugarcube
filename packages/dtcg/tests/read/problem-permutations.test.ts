import { describe, expect, it } from "vitest";
import {
    type DesignTokens,
    type ReadOptions,
    defineGenerator,
    readFromMemory,
} from "../../src/index.js";

const badType = { $type: "colour", x: { $value: 1 } };

function read(
    sources: { base: unknown[]; dark: unknown[] },
    files: Record<string, unknown> = {},
    options?: ReadOptions,
) {
    return readFromMemory(
        {
            files: {
                "tokens.resolver.json": JSON.stringify({
                    version: "2025.10",
                    resolutionOrder: [
                        { type: "set", name: "base", sources: sources.base },
                        {
                            type: "modifier",
                            name: "mode",
                            default: "light",
                            contexts: { light: [], dark: sources.dark },
                        },
                    ],
                }),
                "base.json": JSON.stringify({ gap: { $type: "number", $value: 1 } }),
                ...Object.fromEntries(
                    Object.entries(files).map(([file, json]) => [file, JSON.stringify(json)]),
                ),
            },
            entry: "tokens.resolver.json",
        },
        options,
    );
}

const labels = (tokens: DesignTokens) =>
    tokens.diagnostics
        .filter(({ kind }) => kind === "unknown-type")
        .map(({ permutations }) => permutations.label);

describe("a problem in a source only some permutations read", () => {
    it("names them when the source is written in the resolver", () => {
        const tokens = read({ base: [{ $ref: "base.json" }], dark: [{ odd: badType }] });
        expect(labels(tokens)).toStrictEqual(["mode: dark"]);
    });

    it("names them when the source is the only part of its file read", () => {
        const tokens = read(
            { base: [{ $ref: "base.json" }], dark: [{ $ref: "shared.json#/a" }] },
            { "shared.json": { a: { odd: badType } } },
        );
        expect(labels(tokens)).toStrictEqual(["mode: dark"]);
    });

    it("names them when other permutations read another part of the file", () => {
        const tokens = read(
            {
                base: [{ $ref: "base.json" }, { $ref: "shared.json#/b" }],
                dark: [{ $ref: "shared.json#/a" }],
            },
            { "shared.json": { a: { odd: badType }, b: { more: { $type: "number", $value: 2 } } } },
        );
        expect(labels(tokens)).toStrictEqual(["mode: dark"]);
    });
});

describe("a missing reference written in files only some permutations read", () => {
    const tokens = read(
        { base: [{ $ref: "base.json" }], dark: [{ $ref: "dark.json" }] },
        {
            "base.json": { a: { $type: "number", $value: "{nope}" } },
            "dark.json": { b: { $type: "number", $value: "{nope}" } },
        },
    );
    const missing = tokens.diagnostics.filter(({ kind }) => kind === "missing-reference");

    it("is one problem, naming every token that writes it and every place it is used", () => {
        expect(missing).toHaveLength(1);
        expect(missing[0]?.detail).toStrictEqual({ ref: "nope", from: ["a", "b"] });
        expect(missing[0]?.span?.file).toBe("base.json");
        expect(missing[0]?.related?.map(({ span }) => span.file)).toStrictEqual(["dark.json"]);
    });

    it("holds in every permutation it is missing in", () => {
        expect(missing[0]?.permutations.label).toBe("everywhere");
    });
});

describe("a problem in a generator's setting in a source only some permutations read", () => {
    const steps = defineGenerator({
        extension: ["com.example", "steps"],
        messages: { "too-many": () => "too many steps" },
        generate: () => ({ ok: false, errors: [{ jsonPath: [], reason: "too-many" }] }),
    });
    const tokens = read(
        {
            base: [{ $ref: "base.json" }],
            dark: [{ g: { $type: "number", $extensions: { "com.example": { steps: 99 } } } }],
        },
        {},
        { generators: [steps] },
    );

    it("names those permutations, with the generator's own wording", () => {
        const problems = tokens.diagnostics.filter(({ kind }) => kind === "extension-invalid");
        expect(
            problems.map(({ message, permutations }) => [message, permutations.label]),
        ).toStrictEqual([["too many steps", "mode: dark"]]);
    });
});
