import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { nodeAt, removeAt, renameKeyAt, reorderKeyAt, setAt } from "../src/text.js";

const colorJson = () => readFileSync(join(import.meta.dirname, "fixtures/demo/color.json"), "utf8");
const keysOf = (text: string) => Object.keys(JSON.parse(text).color);

const changedLines = (before: string, after: string) => {
    const a = before.split("\n");
    const b = after.split("\n");
    const lines: number[] = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if (a[i] !== b[i]) lines.push(i + 1);
    }
    return lines;
};

describe("renameKeyAt", () => {
    it("renames a group in place, touching one line", () => {
        const before = colorJson();
        const after = renameKeyAt(before, ["color", "brand"], "primary") as string;

        expect(changedLines(before, after)).toHaveLength(1);
        expect(after.split("\n").length).toBe(before.split("\n").length);
    });

    it("leaves every child, and the group's own description, where they were", () => {
        const before = colorJson();
        const after = JSON.parse(renameKeyAt(before, ["color", "brand"], "primary") as string);

        expect(after.color.brand).toBeUndefined();
        expect(Object.keys(after.color.primary)).toEqual(
            Object.keys(JSON.parse(before).color.brand),
        );
        expect(typeof after.color.primary.$description).toBe("string");
    });

    it("keeps the key in its original position", () => {
        const before = JSON.parse(colorJson());
        const after = JSON.parse(renameKeyAt(colorJson(), ["color", "brand"], "primary") as string);

        const was = Object.keys(before.color).indexOf("brand");
        expect(Object.keys(after.color).indexOf("primary")).toBe(was);
    });

    it("renames a token as readily as a group", () => {
        const after = JSON.parse(
            renameKeyAt(colorJson(), ["color", "brand", "500"], "base") as string,
        );

        expect(after.color.brand["500"]).toBeUndefined();
        expect(after.color.brand.base.$value).toBeDefined();
    });

    it("says so when the path is not there", () => {
        expect(renameKeyAt(colorJson(), ["color", "nope"], "x")).toBeUndefined();
    });

    it("says so when the path is an item in a list, which has no key", () => {
        const stops = '{ "stops": [{ "position": 0 }, { "position": 1 }] }';

        expect(renameKeyAt(stops, ["stops", 1], "x")).toBeUndefined();
        expect(reorderKeyAt(stops, ["stops", 1], 0)).toBeUndefined();
    });
});

describe("setAt and removeAt", () => {
    it("changes one value and nothing else", () => {
        const before = colorJson();
        const after = setAt(before, ["color", "brand", "500", "$value"], "#ff0000");

        expect(JSON.parse(after).color.brand["500"].$value).toBe("#ff0000");
        expect(JSON.parse(after).color.brand["500"].$description).toBe(
            JSON.parse(before).color.brand["500"].$description,
        );
    });

    it("creates the nesting a new token needs", () => {
        const after = JSON.parse(
            setAt(colorJson(), ["color", "raw", "blue"], { $type: "color", $value: "#00f" }),
        );

        expect(after.color.raw.blue).toEqual({ $type: "color", $value: "#00f" });
        expect(after.color.brand).toBeDefined();
    });

    it("removes a key without disturbing its siblings", () => {
        const before = JSON.parse(colorJson());
        const after = JSON.parse(removeAt(colorJson(), ["color", "brand", "500"]));

        expect(after.color.brand["500"]).toBeUndefined();
        expect(Object.keys(after.color.brand)).toEqual(
            Object.keys(before.color.brand).filter((key) => key !== "500"),
        );
    });
});

describe("indentation", () => {
    it("writes into the demo's two-space file with two spaces", () => {
        const after = setAt(colorJson(), ["color", "raw"], { $value: "#000" });

        expect(after).toContain('\n    "raw"');
    });

    it("writes into a four-space file with four spaces, and a tab-indented one with tabs", () => {
        const fourSpaces = '{\n    "color": {\n        "bg": { "$value": "#fff" }\n    }\n}';
        const tabs = '{\n\t"color": {\n\t\t"bg": { "$value": "#fff" }\n\t}\n}';

        expect(setAt(fourSpaces, ["color", "fg"], { $value: "#000" })).toContain('\n        "fg"');
        expect(setAt(tabs, ["color", "fg"], { $value: "#000" })).toContain('\n\t\t"fg"');
    });

    it("takes the most common step when a file is inconsistent", () => {
        const mostlyTwo = '{\n  "a": 1,\n  "b": {\n    "c": 1,\n        "d": 2\n  }\n}';

        expect(setAt(mostlyTwo, ["f"], { g: 1 })).toContain('"f": {\n    "g": 1\n  }');
    });

    it("keeps comments a plain rewrite would lose", () => {
        const source = '{\n  // the page background\n  "bg": { "$value": "#fff" }\n}';
        const after = setAt(source, ["bg", "$value"], "#eee");

        expect(after).toContain("// the page background");
    });
});

describe("reorderKeyAt", () => {
    it("moves a key to the position asked for", () => {
        const before = colorJson();
        const was = keysOf(before);
        const after = reorderKeyAt(before, ["color", "brand"], 4) as string;

        expect(keysOf(after)).not.toEqual(was);
        expect(keysOf(after).indexOf("brand")).toBe(4);
        expect(keysOf(after).sort()).toEqual(was.sort());
    });

    it("moves it to the front, past the group's own metadata", () => {
        const after = reorderKeyAt(colorJson(), ["color", "neutral"], 0) as string;

        expect(keysOf(after)[0]).toBe("neutral");
    });

    it("leaves every property's own text exactly as it was", () => {
        const before = colorJson();
        const after = reorderKeyAt(before, ["color", "brand"], 4) as string;

        const was = JSON.parse(before).color;
        const now = JSON.parse(after).color;
        for (const key of Object.keys(was)) {
            expect(JSON.stringify(now[key])).toBe(JSON.stringify(was[key]));
        }
        expect(after.split("\n")).toHaveLength(before.split("\n").length);
    });

    it("keeps a comment sitting inside a moved property", () => {
        const source = '{\n  "a": {\n    // keep me\n    "x": 1\n  },\n  "b": { "y": 2 }\n}';
        const after = reorderKeyAt(source, ["a"], 1) as string;

        expect(after).toContain("// keep me");
        expect(after.indexOf('"b"')).toBeLessThan(after.indexOf('"a"'));
    });

    it("says so when the key or its parent is not there", () => {
        expect(reorderKeyAt(colorJson(), ["color", "nope"], 0)).toBeUndefined();
        expect(reorderKeyAt(colorJson(), ["nope", "brand"], 0)).toBeUndefined();
    });

    it("hands back the same text when the key is already there", () => {
        const before = colorJson();
        const at = keysOf(before).indexOf("brand");

        expect(at).toBe(2);
        expect(reorderKeyAt(before, ["color", "brand"], at)).toBe(before);
    });
});

describe("nodeAt", () => {
    it("gives the value at a path, as plain JSON", () => {
        expect(nodeAt(colorJson(), ["color", "text", "brand", "$value"])).toBe("{color.brand.700}");
        expect(nodeAt(colorJson(), ["color", "brand", "500", "$value"])).toEqual({
            colorSpace: "oklch",
            components: [0.624, 0.181, 258],
            hex: "#3884f2",
        });
    });

    it("says so when the path is not there", () => {
        expect(nodeAt(colorJson(), ["color", "nope"])).toBeUndefined();
    });
});
