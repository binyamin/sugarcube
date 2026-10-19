import { describe, expect, it } from "vitest";
import type { Permutations } from "../../src/index.js";
import { twoModifierFiles, twoModifiers } from "./two-modifiers.js";

const tokens = twoModifiers();

function inTheirOrder(permutations: Permutations): void {
    const positions = permutations.map((each) => tokens.permutations.indexOf(each));
    for (const [index, position] of positions.entries()) {
        expect(position).toBeGreaterThan(index === 0 ? -1 : positions[index - 1]!);
    }
}

describe("every answer's permutations, with two modifiers and files that overlap", () => {
    it("come once each, in the design tokens' order", () => {
        const larger = twoModifierFiles["large.json"].replace('"$value":3', '"$value":4');
        const changes = tokens.diff(twoModifiers({ "large.json": larger }));
        const answers = [
            ...tokens.writtenAt("gap").flatMap(({ readIn, winsIn }) => [readIn, winsIn]),
            ...tokens.writtenAt("color.x").flatMap(({ readIn, winsIn }) => [readIn, winsIn]),
            ...tokens.resolvedValues("gap").map(({ permutations }) => permutations),
            ...tokens.resolvedValues("color.x").map(({ permutations }) => permutations),
            ...tokens.referencedBy("color.red").map(({ permutations }) => permutations),
            ...tokens.references("color.x").map(({ permutations }) => permutations),
            ...tokens.references("fade").map(({ permutations }) => permutations),
            ...tokens.usedBy("color.red").map(({ permutations }) => permutations),
            ...tokens.diagnostics.flatMap(({ permutations }) =>
                permutations ? [permutations] : [],
            ),
            ...changes.map(({ permutations }) => permutations),
        ];
        expect(tokens.diagnostics.map(({ permutations }) => permutations?.label)).toStrictEqual([
            "size: large",
        ]);
        expect(changes.map(({ permutations }) => permutations.label)).toStrictEqual([
            "size: large",
        ]);
        for (const permutations of answers) inTheirOrder(permutations);
    });

    it("give places in the order first met, walking the permutations in their order", () => {
        const firstMet = [
            ...new Set(
                tokens.permutations.flatMap(
                    (permutation) =>
                        permutation.token("gap")?.writtenAt.map((place) => tokens.spanOf(place)) ??
                        [],
                ),
            ),
        ];
        expect(tokens.writtenAt("gap").map(({ span }) => span)).toStrictEqual(firstMet);
        expect(new Set(firstMet.map(({ file }) => file))).toStrictEqual(
            new Set(["base.json", "dark.json", "large.json"]),
        );
    });
});
