import { describe, expect, it } from "vitest";
import { forbiddenInName, movedPath, pathBelow, withoutRoot } from "../src/index.js";

describe("withoutRoot", () => {
    it.for([
        { path: "color.accent.$root", expected: "color.accent" },
        { path: "color.brand", expected: "color.brand" },
        { path: "$root", expected: "$root" },
    ])("$path is $expected", ({ path, expected }) => {
        expect(withoutRoot(path)).toBe(expected);
    });
});

describe("pathBelow", () => {
    it.for([
        { path: "color.brand.ink", group: "color", expected: "brand.ink" },
        { path: "color.brand.ink", group: "color.brand", expected: "ink" },
        { path: "color.$root", group: "color", expected: "$root" },
        { path: "color.ink", group: "", expected: "color.ink" },
        { path: "color", group: "color", expected: undefined },
        { path: "colors.ink", group: "color", expected: undefined },
        { path: "color", group: "color.brand", expected: undefined },
    ])("$path below $group is $expected", ({ path, group, expected }) => {
        expect(pathBelow(path, group)).toBe(expected);
    });
});

describe("forbiddenInName", () => {
    it.for([
        { name: "a.b", expected: "." },
        { name: "{x", expected: "{" },
        { name: "x}", expected: "}" },
        { name: "$x", expected: "$" },
        { name: "a$b", expected: undefined },
        { name: "$root", expected: undefined },
        { name: "brand", expected: undefined },
    ])("$name gives $expected (Format 5.1.1)", ({ name, expected }) => {
        expect(forbiddenInName(name)).toBe(expected);
    });
});

describe("movedPath", () => {
    const moved = [
        { from: "color.brand", to: "color.house" },
        { from: "color.house.500", to: "color.house.550" },
    ];
    it.for([
        { path: "color.brand", expected: "color.house" },
        { path: "color.brand.300", expected: "color.house.300" },
        { path: "color.brand.500", expected: "color.house.550" },
        { path: "color.brand.$root", expected: "color.house.$root" },
        { path: "color.branding", expected: "color.branding" },
        { path: "space.sm", expected: "space.sm" },
    ])("$path ends up at $expected", ({ path, expected }) => {
        expect(movedPath(path, moved)).toBe(expected);
    });
});
