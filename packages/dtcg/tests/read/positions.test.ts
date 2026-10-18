import { describe, expect, it } from "vitest";
import { readFromMemory } from "../../src/index.js";

const text = JSON.stringify(
    {
        color: {
            $type: "color",
            red: { $value: { colorSpace: "srgb", components: [1, 0, 0] } },
            brand: { $value: "{color.red}" },
        },
    },
    null,
    2,
);
const tokens = readFromMemory({ files: { "tokens.json": text } });
const permutation = tokens.permutation();
const brand = permutation.token("color.brand");
const red = permutation.token("color.red");

const at = (span: { offset: number; length: number }) =>
    text.slice(span.offset, span.offset + span.length);

describe("tokens.spanOf", () => {
    it("gives where a place is written in this read's text", () => {
        const place = red?.valueFrom;
        if (!place) throw new Error("color.red is not read");
        const span = tokens.spanOf(place);
        expect(span.file).toBe("tokens.json");
        expect(JSON.parse(at(span))).toStrictEqual({
            $value: { colorSpace: "srgb", components: [1, 0, 0] },
        });
    });

    it("gives where a reference is written", () => {
        const reference = brand?.references[0];
        if (!reference) throw new Error("color.brand writes no reference");
        expect(at(tokens.spanOf(reference))).toBe('"{color.red}"');
    });

    it("agrees with the places tokens.writtenAt gives", () => {
        const place = brand?.valueFrom;
        if (!place) throw new Error("color.brand is not read");
        expect(tokens.writtenAt("color.brand").map(({ span }) => span)).toStrictEqual([
            tokens.spanOf(place),
        ]);
    });
});

describe("a place and a reference", () => {
    it("hold no position of their own, so they can outlive the text they were read from", () => {
        expect(brand?.valueFrom).not.toHaveProperty("span");
        expect(brand?.references[0]).not.toHaveProperty("span");
    });

    it("still say which source writes them and what it writes", () => {
        expect(brand?.valueFrom.source.file).toBe("tokens.json");
        expect(brand?.valueFrom.written).toStrictEqual({ $value: "{color.red}" });
        expect(brand?.references[0]?.path).toBe("color.red");
    });
});
