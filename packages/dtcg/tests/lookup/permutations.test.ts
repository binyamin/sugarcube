import { describe, expect, it } from "vitest";
import { type DesignSystem, type ReadOptions, readFromMemory } from "../../src/index.js";

const number = (value: number) => ({ $type: "number", $value: value });

const resolver = {
    version: "2025.10",
    sets: { base: { sources: [{ $ref: "base.json" }] } },
    modifiers: {
        mode: {
            contexts: { light: [], dark: [{ $ref: "dark.json" }], sepia: [{ $ref: "dark.json" }] },
            default: "light",
        },
        density: {
            contexts: { comfy: [], compact: [{ $ref: "compact.json" }] },
            default: "comfy",
        },
    },
    resolutionOrder: [
        { $ref: "#/sets/base" },
        { $ref: "#/modifiers/mode" },
        { $ref: "#/modifiers/density" },
    ],
};

const files = {
    "tokens.resolver.json": JSON.stringify(resolver),
    "base.json": JSON.stringify({ gap: number(1), red: number(1), text: number(1) }),
    "dark.json": JSON.stringify({ text: { $type: "number", $value: "{red}" } }),
    "compact.json": JSON.stringify({ gap: number(2) }),
};

function readWith(options?: ReadOptions): DesignSystem {
    return readFromMemory({ files, entry: "tokens.resolver.json" }, options);
}

const ds = readWith();
const named = (input: Record<string, string>) => ds.permutation(input);

describe("ds.permutations", () => {
    it("is every permutation the read built, as a list", () => {
        expect(ds.permutations).toHaveLength(6);
        expect(ds.permutations[0]).toBe(named({}));
        expect(ds.permutations.find((each) => each.label === "mode: dark, density: compact")).toBe(
            named({ mode: "dark", density: "compact" }),
        );
    });

    it("has no label, since nothing narrows it", () => {
        expect(ds.permutations.label).toBeUndefined();
    });

    it("gives the inputs, in the same order", () => {
        expect(ds.permutations.inputs).toStrictEqual(ds.permutations.map(({ input }) => input));
    });
});

describe("the permutations an answer holds in", () => {
    const [reference] = ds.referencedBy("red");

    it("are the permutations themselves", () => {
        expect(reference?.permutations).toContain(named({ mode: "dark" }));
        expect(reference?.permutations).not.toContain(named({}));
    });

    it("are labelled by the contexts they share: one modifier, several contexts", () => {
        expect(reference?.permutations.label).toBe("mode: dark, sepia");
    });

    it("are labelled by each modifier that narrows them, in the resolver's order", () => {
        const compact = ds.writtenAt("gap").find(({ span }) => span.file === "compact.json");
        expect(compact?.permutations.label).toBe("density: compact");
    });

    it("have no label when they are every permutation", () => {
        const [base] = ds.writtenAt("red");
        expect(base?.permutations).toHaveLength(6);
        expect(base?.permutations.label).toBeUndefined();
    });

    it("are written in the plain form as their inputs", () => {
        expect(JSON.parse(JSON.stringify(reference?.permutations))).toStrictEqual(
            reference?.permutations.inputs,
        );
    });
});

describe("a label", () => {
    const themed = readWith({ permutations: "each-context" });

    it("leaves out a modifier that narrows nothing among the permutations read", () => {
        const [reference] = themed.referencedBy("red");
        expect(reference?.permutations).toHaveLength(2);
        expect(reference?.permutations.label).toBe("mode: dark, sepia");
        const compact = themed.writtenAt("gap").find(({ span }) => span.file === "compact.json");
        expect(compact?.permutations.label).toBe("density: compact");
    });

    it("names each modifier that narrows it, in the resolver's order", () => {
        const glowing = readFromMemory({
            files: {
                ...files,
                "dark.json": JSON.stringify({ glow: number(4) }),
                "compact.json": JSON.stringify({ gap: { $type: "number", $value: "{glow}" } }),
            },
            entry: "tokens.resolver.json",
        });
        const problem = glowing.diagnostics.find(({ kind }) => kind === "missing-reference");
        expect(problem?.permutations).toHaveLength(1);
        expect(problem?.permutations?.label).toBe("mode: light, density: compact");
    });

    it("lists each permutation's label when they are not one choice per modifier", () => {
        const both = {
            ...resolver,
            modifiers: {
                mode: {
                    ...resolver.modifiers.mode,
                    contexts: { light: [], dark: [{ $ref: "shared.json" }], sepia: [] },
                },
                density: {
                    ...resolver.modifiers.density,
                    contexts: { comfy: [], compact: [{ $ref: "shared.json" }] },
                },
            },
        };
        const crossed = readFromMemory({
            files: {
                ...files,
                "tokens.resolver.json": JSON.stringify(both),
                "shared.json": JSON.stringify({ gap: number(3) }),
            },
            entry: "tokens.resolver.json",
        });
        const shared = crossed.writtenAt("gap").find(({ span }) => span.file === "shared.json");
        const labels = shared?.permutations.map(({ label }) => label);
        expect(labels).toStrictEqual([
            "mode: light, density: compact",
            "mode: dark, density: comfy",
            "mode: dark, density: compact",
            "mode: sepia, density: compact",
        ]);
        expect(shared?.permutations.label).toBe(labels?.join("; "));
    });
});

describe("a problem's permutations", () => {
    const broken = readFromMemory({
        files: {
            ...files,
            "dark.json": JSON.stringify({ text: { $type: "number", $value: "{missing}" } }),
        },
        entry: "tokens.resolver.json",
    });
    const problem = broken.diagnostics.find(({ kind }) => kind === "missing-reference");

    it("are the permutations themselves, labelled", () => {
        expect(problem?.permutations).toContain(broken.permutation({ mode: "dark" }));
        expect(problem?.permutations?.label).toBe("mode: dark, sepia");
    });

    it("are absent when the problem is in every permutation", () => {
        const everywhere = readFromMemory({
            files: {
                ...files,
                "base.json": JSON.stringify({
                    gap: number(1),
                    red: { $type: "number", $value: "{missing}" },
                    text: number(1),
                }),
            },
            entry: "tokens.resolver.json",
        });
        const found = everywhere.diagnostics.filter(({ kind }) => kind === "missing-reference");
        expect(found).toHaveLength(1);
        expect(found[0]?.permutations).toBeUndefined();
    });

    it("are written in the plain form as their inputs", () => {
        const written = JSON.parse(JSON.stringify(broken)).diagnostics.find(
            ({ kind }: { kind: string }) => kind === "missing-reference",
        );
        expect(written.permutations).toStrictEqual([
            { mode: "dark", density: "comfy" },
            { mode: "dark", density: "compact" },
            { mode: "sepia", density: "comfy" },
            { mode: "sepia", density: "compact" },
        ]);
    });
});

describe("the plain form of the design system", () => {
    it("writes each permutation in full", () => {
        const written = JSON.parse(JSON.stringify(ds));
        expect(written.permutations[0]).toHaveProperty("tokens");
        expect(written.permutations[0].input).toStrictEqual({ mode: "light", density: "comfy" });
    });
});
