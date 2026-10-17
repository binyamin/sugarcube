import { describe, expect, it } from "vitest";
import { permutationsOf } from "../../src/read/permutations-of.js";
import { twoModifiers } from "../lookup/two-modifiers.js";

const { permutations: all } = twoModifiers();

describe("permutationsOf", () => {
    it("gives each permutation once, in the design tokens' order, whatever order it is handed", () => {
        const [first, second, third] = all;
        const given = [third!, first!, third!, second!];
        expect([...permutationsOf(given, all)]).toStrictEqual([first, second, third]);
    });
});
