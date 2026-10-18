import { describe, expect, it } from "vitest";
import { readFromMemory } from "../../src/index.js";

const number = (value: unknown) => ({ $type: "number", $value: value });
const rem = (value: number) => ({ $type: "dimension", $value: { value, unit: "rem" } });

const files = {
    "tokens.resolver.json": JSON.stringify({
        version: "2025.10",
        resolutionOrder: [
            { type: "set", name: "base", sources: [{ $ref: "base.json" }] },
            {
                type: "modifier",
                name: "brand",
                default: "house",
                contexts: {
                    house: [],
                    cbus: [{ $ref: "cbus.json" }],
                    hesta: [{ $ref: "hesta.json" }],
                },
            },
        ],
    }),
    "base.json": JSON.stringify({
        accent: number(1),
        button: number("{accent}"),
        gap: rem(0.3),
        broken: number("{nope}"),
        weight: number(400),
        lost: number("{nope}"),
    }),
    "cbus.json": JSON.stringify({
        accent: number(2),
        gap: rem(0.1 + 0.2),
        badge: number(5),
        weight: { $type: "fontWeight", $value: 400 },
        lost: number("{gone}"),
    }),
    "hesta.json": JSON.stringify({ accent: number(2) }),
};

const tokens = readFromMemory({ files, entry: "tokens.resolver.json" });

const shown = (path: string) =>
    tokens
        .resolvedValues(path)
        .map(({ token, permutations }) => [token.resolved, permutations.label]);

describe("tokens.resolvedValues", () => {
    it("gives each value the token resolves to, with the permutations that get it", () => {
        expect(shown("accent")).toStrictEqual([
            [1, "default"],
            [2, "brand: cbus, hesta"],
        ]);
    });

    it("follows references, so a value written once can look different per permutation", () => {
        expect(tokens.writtenAt("button")).toHaveLength(1);
        expect(shown("button")).toStrictEqual([
            [1, "default"],
            [2, "brand: cbus, hesta"],
        ]);
    });

    it("counts values that differ only by rounding as one, as sameValue does", () => {
        expect(shown("gap")).toStrictEqual([[{ value: 0.3, unit: "rem" }, "everywhere"]]);
    });

    it("gives the token from the first permutation that gets each value", () => {
        for (const { token, permutations } of tokens.resolvedValues("accent")) {
            expect(token).toBe(permutations[0]?.token("accent"));
        }
    });

    it("leaves out the permutations without the token", () => {
        expect(shown("badge")).toStrictEqual([[5, "brand: cbus"]]);
    });

    it("groups a token whose value can't be worked out by what it says", () => {
        const [only, ...rest] = tokens.resolvedValues("broken");
        expect(rest).toStrictEqual([]);
        expect(only?.token.resolved).toBeUndefined();
        expect(only?.permutations.label).toBe("everywhere");
    });

    it("counts the same value under different types as two", () => {
        expect(shown("weight")).toStrictEqual([
            [400, "brand: house, hesta"],
            [400, "brand: cbus"],
        ]);
    });

    it("counts tokens whose values can't be worked out, saying different things, as two", () => {
        expect(
            tokens.resolvedValues("lost").map(({ permutations }) => permutations.label),
        ).toStrictEqual(["brand: house, hesta", "brand: cbus"]);
    });

    it("is empty for a group or a path nothing writes", () => {
        const grouped = readFromMemory({
            files: { "tokens.json": JSON.stringify({ color: { red: number(1) } }) },
        });
        expect(grouped.resolvedValues("color")).toStrictEqual([]);
        expect(tokens.resolvedValues("nope")).toStrictEqual([]);
    });
});
