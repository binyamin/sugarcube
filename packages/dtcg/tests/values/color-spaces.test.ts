import { describe, expect, it } from "vitest";
import { colorSpaces } from "../../src/values.js";

describe("colorSpaces", () => {
    it("gives each unbounded channel the range the Color module says it keeps to in practice", () => {
        expect(colorSpaces.lab[1].inPractice).toEqual({ min: -160, max: 160 });
        expect(colorSpaces.lab[2].inPractice).toEqual({ min: -160, max: 160 });
        expect(colorSpaces.lch[1].inPractice).toEqual({ min: 0, max: 230 });
        expect(colorSpaces.oklab[1].inPractice).toEqual({ min: -0.5, max: 0.5 });
        expect(colorSpaces.oklab[2].inPractice).toEqual({ min: -0.5, max: 0.5 });
        expect(colorSpaces.oklch[1].inPractice).toEqual({ min: 0, max: 0.5 });
    });

    it("gives every channel a finite range to use, its own where it is bounded", () => {
        for (const channels of Object.values(colorSpaces)) {
            for (const channel of channels) {
                const { min, max } = channel.inPractice ?? channel;
                expect(Number.isFinite(min) && Number.isFinite(max)).toBe(true);
                if (Number.isFinite(channel.max)) expect(channel.inPractice).toBeUndefined();
            }
        }
    });
});
