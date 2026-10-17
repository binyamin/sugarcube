import { describe, expect, it } from "vitest";
import { readFromMemory } from "../../src/index.js";

const red = { colorSpace: "srgb", components: [1, 0, 0] };
const color = (value: unknown) => ({ $type: "color", $value: value });
const stop = (position: number) => ({ color: "{color.red}", position });

const tokens = readFromMemory({
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
            color: { red: color(red), brand: color("{color.red}"), text: color("{color.brand}") },
            fade: { $type: "gradient", $value: [stop(0), stop(1)] },
        }),
        "dark.json": JSON.stringify({
            color: { brand: color("{color.red}"), muted: color("{color.red}") },
        }),
    },
});

const used = (target: string, chained = false) =>
    tokens.usedBy(target, { chained }).map(({ path, permutations }) => ({
        path,
        label: permutations.label,
        count: permutations.length,
    }));
const firstMet = (paths: string[]) => [...new Set(paths)];

describe("tokens.usedBy", () => {
    it("gives each token that refers to the path once, with every permutation it does in", () => {
        expect(used("color.red")).toStrictEqual([
            { path: "color.brand", label: "everywhere", count: 2 },
            { path: "fade", label: "everywhere", count: 2 },
            { path: "color.muted", label: "mode: dark", count: 1 },
        ]);
    });

    it("with chained, also each token that refers to one of those, in referencedBy's order", () => {
        const references = tokens.referencedBy("color.red", { chained: true });
        expect(used("color.red", true).map(({ path }) => path)).toStrictEqual(
            firstMet(references.map(({ from }) => from)),
        );
        expect(used("color.red", true).map(({ path }) => path)).toContain("color.text");
    });

    it("is empty for a token nothing refers to", () => {
        expect(used("color.text")).toStrictEqual([]);
    });
});

describe("token.usedBy", () => {
    it("gives each token that refers to it in this permutation once, in referencedBy's order", () => {
        for (const permutation of tokens.permutations) {
            const target = permutation.token("color.red");
            for (const chained of [false, true]) {
                const references = target?.referencedBy({ chained }) ?? [];
                expect(target?.usedBy({ chained })).toStrictEqual([
                    ...new Set(references.map(({ from }) => from)),
                ]);
            }
        }
        const dark = tokens.permutation({ mode: "dark" }).token("color.red");
        expect(
            dark
                ?.usedBy()
                .map(({ path }) => path)
                .sort(),
        ).toStrictEqual(["color.brand", "color.muted", "fade"]);
        expect(dark?.referencedBy().filter(({ from }) => from.path === "fade")).toHaveLength(2);
    });
});
