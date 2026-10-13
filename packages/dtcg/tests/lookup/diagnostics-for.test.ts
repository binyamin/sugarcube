import { describe, expect, it } from "vitest";
import { diagnosticsFor, readFromMemory } from "../../src/index.js";

const resolver = {
    version: "2025.10",
    sets: { base: { sources: [{ $ref: "base.json" }] } },
    modifiers: {
        mode: { contexts: { light: [], dark: [{ $ref: "dark.json" }] }, default: "light" },
    },
    resolutionOrder: [{ $ref: "#/sets/base" }, { $ref: "#/modifiers/mode" }],
};

const doc = readFromMemory(
    {
        files: {
            "tokens.resolver.json": JSON.stringify(resolver),
            "base.json": JSON.stringify({
                color: {
                    $type: "color",
                    ok: { $value: "#ffffff" },
                    bad: { $value: "nope" },
                    a: { $value: "{color.missing}" },
                    b: { $value: "{color.missing}" },
                },
                loop: { $type: "number", x: { $value: "{loop.y}" }, y: { $value: "{loop.x}" } },
                space: { $type: "dimension", sm: { $value: { value: 4, unit: "px" } } },
            }),
            "dark.json": JSON.stringify({
                space: { $type: "dimension", $value: { value: 8, unit: "px" } },
            }),
        },
        entry: "tokens.resolver.json",
    },
    { hexStringColors: true },
);

const kinds = (path: string, input?: Record<string, string>) =>
    diagnosticsFor(doc, path, input).map(({ kind }) => kind);

describe("diagnosticsFor", () => {
    it("gives a token's own problems", () => {
        expect(kinds("color.bad")).toStrictEqual(["invalid-value"]);
    });

    it("gives a missing reference to every token that uses it, though it is reported once", () => {
        expect(kinds("color.a")).toStrictEqual(["missing-reference"]);
        expect(kinds("color.b")).toStrictEqual(["missing-reference"]);
        expect(doc.diagnostics.filter(({ kind }) => kind === "missing-reference")).toHaveLength(1);
    });

    it("gives a reference loop to every token in it", () => {
        expect(kinds("loop.x")).toStrictEqual(["circular-reference"]);
        expect(kinds("loop.y")).toStrictEqual(["circular-reference"]);
    });

    it("gives a group its own problems", () => {
        expect(kinds("space")).toStrictEqual(["token-and-group"]);
    });

    it("gives a token with no problems none", () => {
        expect(kinds("color.ok")).toStrictEqual([]);
    });

    it("gives only the problems in a permutation, when asked for one", () => {
        expect(kinds("space", { mode: "dark" })).toStrictEqual(["token-and-group"]);
        expect(kinds("space", { mode: "light" })).toStrictEqual([]);
        expect(kinds("color.bad", { mode: "light" })).toStrictEqual(["invalid-value"]);
        expect(kinds("color.bad", { mode: "dark" })).toStrictEqual(["invalid-value"]);
    });

    it("gives the same answer for the design system saved as JSON and read back", () => {
        const copy = JSON.parse(JSON.stringify(doc)) as typeof doc;
        expect(
            diagnosticsFor(copy, "space", { mode: "dark" }).map(({ kind }) => kind),
        ).toStrictEqual(["token-and-group"]);
    });

    it("gives no token a file's problem", () => {
        const broken = readFromMemory({ files: { "tokens.json": '{ "a": ' } });
        expect(broken.diagnostics.length).toBeGreaterThan(0);
        expect(diagnosticsFor(broken, "a")).toStrictEqual([]);
    });
});
