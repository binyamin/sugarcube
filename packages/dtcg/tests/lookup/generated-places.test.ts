import { describe, expect, it } from "vitest";
import { defineGenerator, readFromMemory } from "../../src/index.js";

const steps = defineGenerator({
    extension: ["com.example", "steps"],
    messages: {},
    generate: () => ({ ok: true, value: [{ name: "a", $value: "{base}" }] }),
});

const tokens = readFromMemory(
    {
        files: {
            "tokens.resolver.json": JSON.stringify({
                version: "2025.10",
                resolutionOrder: [
                    { type: "set", name: "base", sources: [{ $ref: "tokens.json" }] },
                    {
                        type: "modifier",
                        name: "mode",
                        default: "light",
                        contexts: { light: [], dark: [] },
                    },
                ],
            }),
            "tokens.json": JSON.stringify({
                base: { $type: "number", $value: 1 },
                g: { $type: "number", $extensions: { "com.example": { steps: 1 } } },
            }),
        },
        entry: "tokens.resolver.json",
    },
    { generators: [steps] },
);

describe("generated tokens across permutations", () => {
    it("is written in one place, read in every permutation", () => {
        const places = tokens.writtenAt("g.a");
        expect(places.map(({ readIn }) => readIn.label)).toStrictEqual(["everywhere"]);
    });

    it("is one reference to what it references, in every permutation", () => {
        const references = tokens.referencedBy("base");
        expect(
            references.map(({ from, permutations }) => [from, permutations.label]),
        ).toStrictEqual([["g.a", "everywhere"]]);
    });

    it("has the same span in every permutation", () => {
        const [light, dark] = tokens.permutations;
        expect(light?.token("g.a")?.valueFrom.span).toBe(dark?.token("g.a")?.valueFrom.span);
    });

    it("are each a reference when a generator makes several from one setting", () => {
        const two = defineGenerator({
            extension: ["com.example", "steps"],
            messages: {},
            generate: () => ({
                ok: true,
                value: [
                    { name: "a", $value: "{base}" },
                    { name: "b", $value: "{base}" },
                ],
            }),
        });
        const both = readFromMemory(
            {
                files: {
                    "tokens.json": JSON.stringify({
                        base: { $type: "number", $value: 1 },
                        g: { $type: "number", $extensions: { "com.example": { steps: 1 } } },
                    }),
                },
            },
            { generators: [two] },
        );
        expect(both.referencedBy("base").map(({ from }) => from)).toStrictEqual(["g.a", "g.b"]);
    });
});
