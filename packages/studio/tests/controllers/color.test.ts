import { describe, expect, it } from "vitest";
import { colorCss, isTranslucent, picked } from "../../src/controllers/color";
import { fieldFor } from "../../src/controllers/value-field";

const brand = { colorSpace: "oklch", components: [0.624, 0.181, 258], hex: "#3884f2" };

function colorField(written: Parameters<typeof fieldFor>[1]) {
    const field = fieldFor("color", written);
    if (field.kind !== "color") throw new Error(field.kind);
    return field;
}

describe("fieldFor, a colour", () => {
    it("shows a colour written as the spec's object", () => {
        expect(fieldFor("color", brand)).toMatchObject({ kind: "color", written: brand });
    });

    it("shows a colour written as a hex string", () => {
        expect(fieldFor("color", "#26262f1a")).toMatchObject({
            kind: "color",
            written: "#26262f1a",
        });
        expect(fieldFor("color", "#fff")).toMatchObject({ kind: "color", written: "#fff" });
    });

    it("shows a component written 'none', as the spec allows", () => {
        const grey = { colorSpace: "oklch", components: [0.5, 0, "none"] };

        expect(fieldFor("color", grey)).toMatchObject({ kind: "color", written: grey });
    });

    it("falls back to JSON for a colour it can't show exactly", () => {
        for (const odd of [
            { ...brand, name: "brand" },
            { colorSpace: "oklch", components: [0.5, 0.1] },
            { colorSpace: "cmyk", components: [0, 0, 0] },
            "red",
            "#12345",
        ]) {
            expect(fieldFor("color", odd)).toEqual({ kind: "json", value: odd });
        }
    });
});

describe("colorCss", () => {
    it("writes the colour in its own colour space, for the swatch and the picker", () => {
        expect(colorCss(colorField(brand))).toBe("oklch(0.624 0.181 258)");
        expect(colorCss(colorField({ colorSpace: "hsl", components: [210, 50, 40] }))).toBe(
            "hsl(210 50% 40%)",
        );
        expect(colorCss(colorField({ colorSpace: "display-p3", components: [1, 0, 0] }))).toBe(
            "color(display-p3 1 0 0)",
        );
        expect(
            colorCss(colorField({ colorSpace: "oklch", components: [0.5, 0, "none"], alpha: 0.5 })),
        ).toBe("oklch(0.5 0 none / 0.5)");
        expect(colorCss(colorField("#26262f1a"))).toBe("#26262f1a");
    });
});

describe("isTranslucent", () => {
    it("is true when the colour is less than opaque", () => {
        expect(isTranslucent(colorField("#26262f1a"))).toBe(true);
        expect(isTranslucent(colorField({ ...brand, alpha: 0.5 }))).toBe(true);
        expect(isTranslucent(colorField(brand))).toBe(false);
        expect(isTranslucent(colorField("#26262f"))).toBe(false);
    });
});

describe("picked", () => {
    it("keeps a hex string a hex string, with eight digits only when translucent", () => {
        expect(picked(colorField("#26262f1a"), "oklch(0.3 0.02 280 / 0.1)")?.written).toBe(
            "#2c2d381a",
        );
        expect(picked(colorField("#26262f"), "oklch(0.65 0.2 258)")?.written).toBe("#348bff");
    });

    it("writes the spec's object in the colour space the picker gives back", () => {
        expect(picked(colorField(brand), "oklch(0.65 0.2 258)")?.written).toEqual({
            colorSpace: "oklch",
            components: [0.65, 0.2, 258],
            hex: "#348bff",
        });
        expect(picked(colorField(brand), "color(display-p3 1 0 0)")?.written).toEqual({
            colorSpace: "display-p3",
            components: [1, 0, 0],
            hex: "#ff0000",
        });
    });

    it("scales HSL's saturation and lightness to the spec's 0 to 100", () => {
        expect(
            picked(colorField({ colorSpace: "hsl", components: [0, 0, 0] }), "hsl(210 50% 40%)")
                ?.written,
        ).toEqual({ colorSpace: "hsl", components: [210, 50, 40] });
    });

    it("writes the members the file wrote, and alpha only when it isn't opaque", () => {
        const plain = { colorSpace: "srgb", components: [0, 0, 0] };

        expect(picked(colorField(plain), "color(srgb 1 0 0)")?.written).toEqual({
            colorSpace: "srgb",
            components: [1, 0, 0],
        });
        expect(picked(colorField(plain), "color(srgb 1 0 0 / 0.5)")?.written).toEqual({
            colorSpace: "srgb",
            components: [1, 0, 0],
            alpha: 0.5,
        });
        expect(picked(colorField({ ...plain, alpha: 0.5 }), "color(srgb 1 0 0)")?.written).toEqual({
            colorSpace: "srgb",
            components: [1, 0, 0],
            alpha: 1,
        });
    });

    it("writes a missing hue as 'none'", () => {
        expect(picked(colorField(brand), "oklch(0.5 0 none)")?.written).toEqual({
            colorSpace: "oklch",
            components: [0.5, 0, "none"],
            hex: "#636363",
        });
    });

    it("gives nothing for a value it can't read", () => {
        expect(picked(colorField(brand), "nonsense")).toBeUndefined();
    });
});
