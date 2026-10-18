import { describe, expect, it } from "vitest";
import { readFromMemory } from "../../src/index.js";

const red = { colorSpace: "srgb", components: [1, 0, 0] };
const px = (value: number) => ({ value, unit: "px" });

const permutation = readFromMemory({
    files: {
        "tokens.json": JSON.stringify({
            color: {
                $type: "color",
                red: { $value: red },
                brand: { $value: "{color.red}" },
                text: { $value: "{color.brand}" },
            },
            lift: {
                $type: "shadow",
                $value: {
                    color: "{color.red}",
                    offsetX: px(0),
                    offsetY: px(1),
                    blur: px(2),
                    spread: px(0),
                },
            },
        }),
    },
}).permutation();

describe("what a token works out from itself", () => {
    it("is the same each time it is read, as the read gives everything else", () => {
        const text = permutation.token("color.text");
        const lift = permutation.token("lift");

        expect(text?.aliasChain).toBe(text?.aliasChain);
        expect(lift?.parts).toBe(lift?.parts);
        expect(text?.aliasChain.map(({ path }) => path)).toStrictEqual([
            "color.text",
            "color.brand",
            "color.red",
        ]);
        expect(lift?.parts).toBeDefined();
    });
});
