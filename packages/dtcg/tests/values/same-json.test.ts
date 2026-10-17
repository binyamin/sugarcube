import { describe, expect, it } from "vitest";
import { sameJson } from "../../src/index.js";

describe("sameJson", () => {
    it("is true for the same JSON, with object keys in any order", () => {
        expect(sameJson({ a: 1, b: [true, null, "x"] }, { b: [true, null, "x"], a: 1 })).toBe(true);
        expect(sameJson("{color.red}", "{color.red}")).toBe(true);
    });

    it("is false for lists in another order, a key more or less, or another value", () => {
        expect(sameJson([1, 2], [2, 1])).toBe(false);
        expect(sameJson({ a: 1 }, { a: 1, b: 2 })).toBe(false);
        expect(sameJson({ a: 1 }, { a: "1" })).toBe(false);
        expect(sameJson(null, {})).toBe(false);
    });

    it("compares numbers exactly, unlike sameValue", () => {
        expect(sameJson(0.1 + 0.2, 0.3)).toBe(false);
    });
});
