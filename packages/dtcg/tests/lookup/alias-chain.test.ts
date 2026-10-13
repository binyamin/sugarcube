import { describe, expect, it } from "vitest";
import { aliasChain, permutation, readFromMemory } from "../../src/index.js";

const color = (value: unknown) => ({ $type: "color", $value: value });
const red = { colorSpace: "srgb", components: [1, 0, 0] };

const resolver = {
    version: "2025.10",
    resolutionOrder: [
        { type: "set", name: "base", sources: [{ $ref: "base.json" }] },
        {
            type: "modifier",
            name: "theme",
            default: "light",
            contexts: { light: [], dark: [{ $ref: "dark.json" }] },
        },
    ],
};

const doc = readFromMemory({
    files: {
        "tokens.resolver.json": JSON.stringify(resolver),
        "base.json": JSON.stringify({
            palette: { red: color(red), rose: color(red) },
            brand: color("{palette.red}"),
            text: color("{brand}"),
            pointed: color({ $ref: "#/brand/$value" }),
            whole: color({ $ref: "#/brand" }),
            part: color({ $ref: "#/line/$value/color" }),
            gone: color("{nowhere}"),
            ring: color("{loop}"),
            loop: color("{ring}"),
            line: {
                $type: "border",
                $value: { color: "{brand}", width: { value: 1, unit: "px" }, style: "solid" },
            },
        }),
        "dark.json": JSON.stringify({ brand: color("{palette.rose}") }),
    },
    entry: "tokens.resolver.json",
});

describe("aliasChain", () => {
    it("follows whole-value references from the token to the one that holds a value", () => {
        expect(aliasChain(doc, "text")).toStrictEqual(["text", "brand", "palette.red"]);
    });

    it("follows each permutation's own references", () => {
        expect(aliasChain(doc, "text", { theme: "dark" })).toStrictEqual([
            "text",
            "brand",
            "palette.rose",
        ]);
        const dark = permutation(doc, { theme: "dark" });
        expect(dark && aliasChain(dark, "text")).toStrictEqual(["text", "brand", "palette.rose"]);
    });

    it("follows a pointer to a whole value, or to the token itself, as the read does", () => {
        expect(aliasChain(doc, "pointed")).toStrictEqual(["pointed", "brand", "palette.red"]);
        expect(aliasChain(doc, "whole")).toStrictEqual(["whole", "brand", "palette.red"]);
    });

    it("is the token alone when its value is not a whole reference: a composite holding one, a pointer into a part", () => {
        expect(aliasChain(doc, "palette.red")).toStrictEqual(["palette.red"]);
        expect(aliasChain(doc, "line")).toStrictEqual(["line"]);
        expect(aliasChain(doc, "part")).toStrictEqual(["part"]);
    });

    it("stops at a reference to nothing, and at a loop, without repeating", () => {
        expect(aliasChain(doc, "gone")).toStrictEqual(["gone"]);
        expect(aliasChain(doc, "ring")).toStrictEqual(["ring", "loop"]);
    });

    it("is empty for a token that isn't there", () => {
        expect(aliasChain(doc, "nope")).toStrictEqual([]);
    });
});
