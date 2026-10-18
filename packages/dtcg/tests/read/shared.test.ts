import { describe, expect, it } from "vitest";
import { type Permutation, defineGenerator, readFromMemory } from "../../src/index.js";

const rgb = (red: number) => ({ colorSpace: "srgb", components: [red, 0, 0] });

const steps = defineGenerator({
    extension: ["com.example", "steps"],
    messages: {},
    generate: (_group, count: unknown) => ({
        ok: true,
        value: Array.from({ length: Number(count) }, (_, i) => ({
            name: `${i + 1}`,
            $value: i + 1,
        })),
    }),
});

const read = (dark: unknown) =>
    readFromMemory(
        {
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
                "base.json": JSON.stringify({
                    color: {
                        $type: "color",
                        red: { $value: rgb(1) },
                        blue: { $value: { colorSpace: "srgb", components: [0, 0, 1] } },
                        brand: { $value: "{color.red}" },
                        text: { $value: "{color.brand}" },
                        accent: { $value: "{color.blue}" },
                    },
                    level: {
                        $type: "number",
                        red: { $value: { $ref: "#/color/red/$value/components/0" } },
                        blue: { $value: { $ref: "#/color/blue/$value/components/2" } },
                    },
                    space: { $type: "number", sm: { $value: 4 }, md: { $value: 8 } },
                    size: { $type: "number", sm: { $value: 1 } },
                    step: { $type: "number", $extensions: { "com.example": { steps: 2 } } },
                }),
                "dark.json": JSON.stringify(dark),
            },
            entry: "tokens.resolver.json",
        },
        { generators: [steps] },
    );

const tokens = read({
    color: { red: { $value: rgb(0.5) } },
    size: { $deprecated: true },
});
const light = tokens.permutation({ mode: "light" });
const dark = tokens.permutation({ mode: "dark" });
const same = (path: string) => light.token(path) === dark.token(path);

describe("a token the same in two permutations", () => {
    it("is one object when it is written in the same place and points at nothing", () => {
        expect(light.token("color.blue")).toBeDefined();
        expect(same("color.blue")).toBe(true);
        expect(same("space.sm")).toBe(true);
    });

    it("is one object when everything it points at is", () => {
        expect(same("color.accent")).toBe(true);
        expect(dark.token("color.accent")?.references[0]?.token).toBe(dark.token("color.blue"));
    });

    it("is one object when a JSON Pointer reaches inside a value that is the same", () => {
        expect(same("level.blue")).toBe(true);
    });

    it("is one object when a generator hands back the same tokens for the same extension", () => {
        expect(light.token("step.1")).toBeDefined();
        expect(same("step.1")).toBe(true);
        expect(same("step.2")).toBe(true);
    });
});

describe("a token that differs between permutations", () => {
    it("is two objects when a later file writes it", () => {
        expect(same("color.red")).toBe(false);
    });

    it("is two objects when it points at a token that is", () => {
        expect(same("color.brand")).toBe(false);
        expect(same("color.text")).toBe(false);
        expect(dark.token("color.text")?.references[0]?.token).toBe(dark.token("color.brand"));
        expect(light.token("color.text")?.references[0]?.token).toBe(light.token("color.brand"));
    });

    it("is two objects when a JSON Pointer reaches inside a value that differs", () => {
        expect(same("level.red")).toBe(false);
        expect(light.token("level.red")?.resolved).toBe(1);
        expect(dark.token("level.red")?.resolved).toBe(0.5);
    });

    it("is two objects when what it takes from its group differs", () => {
        expect(dark.token("size.sm")?.deprecated).toBe(true);
        expect(same("size.sm")).toBe(false);
    });

    it("is two objects when a permutation writes its own extension for the generator", () => {
        const own = read({ step: { $extensions: { "com.example": { steps: 3 } } } });
        const ownLight = own.permutation({ mode: "light" });
        const ownDark = own.permutation({ mode: "dark" });
        expect(ownDark.token("step.3")).toBeDefined();
        expect(ownLight.token("step.1")).not.toBe(ownDark.token("step.1"));
    });
});

describe("a group the same in two permutations", () => {
    it("is one object when its own facts and every child are", () => {
        expect(light.group("space")).toBe(dark.group("space"));
        expect(light.group("step")).toBe(dark.group("step"));
    });

    it("is two objects when a child differs", () => {
        expect(light.group("color")).not.toBe(dark.group("color"));
        expect(dark.group("color")?.children).toContain(dark.token("color.blue"));
        expect(light.group("color")?.children).toContain(light.token("color.blue"));
    });

    it("is two objects when its own facts differ", () => {
        expect(light.group("size")).not.toBe(dark.group("size"));
    });
});

describe("each permutation's own answers about a shared token", () => {
    it("still name only that permutation's users", () => {
        const users = (permutation: Permutation) =>
            permutation.usedBy("color.red").map(({ path }) => path);
        expect(users(light)).toStrictEqual(["color.brand", "level.red"]);
        expect(dark.usedBy("color.red").every((user) => dark.token(user.path) === user)).toBe(true);
    });

    it("still list every token in the order the files write them", () => {
        expect(light.tokens.map(({ path }) => path)).toStrictEqual(
            dark.tokens.map(({ path }) => path),
        );
        expect(light.tokens.map(({ path }) => path).slice(0, 5)).toStrictEqual([
            "color.red",
            "color.blue",
            "color.brand",
            "color.text",
            "color.accent",
        ]);
    });
});

describe("a loop", () => {
    const looped = readFromMemory({
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
            "base.json": JSON.stringify({
                loop: { $type: "number", a: { $value: "{loop.b}" }, b: { $value: "{loop.a}" } },
                x: { a: { $extends: "{y}", $type: "number", n: { $value: 1 } } },
                y: { b: { $extends: "{x}" } },
            }),
            "dark.json": JSON.stringify({ other: { $type: "number", $value: 1 } }),
        },
        entry: "tokens.resolver.json",
    });

    it("of references links each permutation's tokens to its own", () => {
        for (const permutation of looped.permutations) {
            const [a, b] = [permutation.token("loop.a"), permutation.token("loop.b")];
            expect(a?.references[0]?.token).toBe(b);
            expect(b?.references[0]?.token).toBe(a);
        }
    });

    it("through children and $extends is reported, and every group is still built", () => {
        expect(looped.diagnostics.map(({ kind, path }) => [kind, path])).toContainEqual([
            "circular-reference",
            "x.a",
        ]);
        for (const permutation of looped.permutations) {
            expect(permutation.group("x.a")?.extends).toBeUndefined();
            expect(permutation.group("x")?.children).toContain(permutation.group("x.a"));
            expect(permutation.group("y")?.children).toContain(permutation.group("y.b"));
        }
    });
});
