import type { JsonValue, TokenType } from "@sugarcube-sh/dtcg";
import { describe, expect, it } from "vitest";
import {
    changes,
    draftFor,
    fieldFor,
    fieldFrom,
    hasField,
    moved,
    referable,
    says,
    without,
    writtenFor,
} from "../../src/controllers/value-field";
import { demoFiles, demoMessage, studioOn } from "./demo-message";

describe("fieldFor", () => {
    it("shows a dimension as its number and unit", () => {
        expect(fieldFor("dimension", { value: 2, unit: "rem" })).toEqual({
            kind: "dimension",
            value: 2,
            unit: "rem",
        });
    });

    it("shows a duration as its number and unit", () => {
        expect(fieldFor("duration", { value: 150, unit: "ms" })).toEqual({
            kind: "duration",
            value: 150,
            unit: "ms",
        });
    });

    it("shows a number", () => {
        expect(fieldFor("number", 1.5)).toEqual({ kind: "number", value: 1.5 });
    });

    it("shows a font weight as the keyword or the number the file wrote", () => {
        expect(fieldFor("fontWeight", "semi-bold")).toEqual({
            kind: "fontWeight",
            value: "semi-bold",
        });
        expect(fieldFor("fontWeight", 650)).toEqual({ kind: "fontWeight", value: 650 });
    });

    it("shows a font family as its list of fonts, remembering a single name written alone", () => {
        expect(fieldFor("fontFamily", "system-ui")).toEqual({
            kind: "fontFamily",
            fonts: ["system-ui"],
            alone: true,
        });
        expect(fieldFor("fontFamily", ["Inter", "sans-serif"])).toEqual({
            kind: "fontFamily",
            fonts: ["Inter", "sans-serif"],
            alone: false,
        });
    });

    it("shows a cubic Bézier as its four numbers", () => {
        expect(fieldFor("cubicBezier", [0.4, 0, 0.2, 1])).toEqual({
            kind: "cubicBezier",
            points: [0.4, 0, 0.2, 1],
        });
    });

    it("shows a stroke style keyword", () => {
        expect(fieldFor("strokeStyle", "dashed")).toEqual({
            kind: "strokeStyle",
            keyword: "dashed",
        });
    });

    it("shows a reference to a whole token as the token's path, for every type", () => {
        expect(fieldFor("dimension", "{size.step.0}")).toEqual({
            kind: "reference",
            path: "size.step.0",
        });
        expect(fieldFor("shadow", "{shadow.sm}")).toEqual({ kind: "reference", path: "shadow.sm" });
    });

    it("falls back to JSON for what no field can show exactly", () => {
        const fallbacks: [TokenType, JsonValue][] = [
            ["dimension", { value: 2, unit: "em" }],
            ["dimension", { value: 2, unit: "rem", note: "fluid" }],
            ["dimension", "2rem"],
            ["dimension", { $ref: "#/size/step/0/$value" }],
            ["fontWeight", "Bold"],
            ["cubicBezier", [0.4, 0, 0.2]],
            ["strokeStyle", { dashArray: [{ value: 2, unit: "px" }], lineCap: "round" }],
            ["color", { colorSpace: "srgb", components: [1, 0, 0] }],
            [
                "shadow",
                {
                    color: "{color.neutral.900}",
                    offsetX: { value: 0, unit: "px" },
                    offsetY: { value: 1, unit: "px" },
                    blur: { value: 2, unit: "px" },
                    spread: { value: 0, unit: "px" },
                },
            ],
        ];

        for (const [type, written] of fallbacks) {
            expect(fieldFor(type, written)).toEqual({ kind: "json", value: written });
        }
    });

    it("falls back to JSON for a token with no type", () => {
        expect(fieldFor(undefined, 4)).toEqual({ kind: "json", value: 4 });
    });
});

describe("writtenFor", () => {
    it("writes what the file would hold for each field", () => {
        expect(writtenFor({ kind: "dimension", value: 1.5, unit: "rem" })).toEqual({
            value: 1.5,
            unit: "rem",
        });
        expect(writtenFor({ kind: "duration", value: 0.2, unit: "s" })).toEqual({
            value: 0.2,
            unit: "s",
        });
        expect(writtenFor({ kind: "number", value: 3 })).toBe(3);
        expect(writtenFor({ kind: "fontWeight", value: "bold" })).toBe("bold");
        expect(writtenFor({ kind: "cubicBezier", points: [0, 0, 1, 1] })).toEqual([0, 0, 1, 1]);
        expect(writtenFor({ kind: "strokeStyle", keyword: "solid" })).toBe("solid");
        expect(writtenFor({ kind: "reference", path: "color.neutral.900" })).toBe(
            "{color.neutral.900}",
        );
    });

    it("writes a single font alone only where the file wrote it alone", () => {
        expect(writtenFor({ kind: "fontFamily", fonts: ["Inter"], alone: true })).toBe("Inter");
        expect(writtenFor({ kind: "fontFamily", fonts: ["Inter"], alone: false })).toEqual([
            "Inter",
        ]);
        expect(
            writtenFor({ kind: "fontFamily", fonts: ["Inter", "sans-serif"], alone: true }),
        ).toEqual(["Inter", "sans-serif"]);
    });

    it("writes back exactly what it was shown", () => {
        const written: [TokenType, JsonValue][] = [
            ["dimension", { value: 2, unit: "rem" }],
            ["fontWeight", 650],
            ["fontWeight", "semi-bold"],
            ["fontFamily", "system-ui"],
            ["fontFamily", ["Inter", "sans-serif"]],
            ["cubicBezier", [0.4, 0, 0.2, 1]],
            ["dimension", "{size.step.0}"],
            ["color", { colorSpace: "srgb", components: [1, 0, 0] }],
        ];

        for (const [type, value] of written) {
            expect(writtenFor(fieldFor(type, value))).toEqual(value);
        }
    });
});

describe("referable", () => {
    it("lists every other token of the type, for the Token side of a field", () => {
        const { tokens, showing } = studioOn().state;

        expect(referable(tokens, showing, "fontFamily", "typography.font.body")).toEqual([
            "typography.font.mono",
            "typography.font.system",
        ]);
    });

    it("lists a token only one theme has, since a row may be that theme's", () => {
        const files = demoFiles();
        const dark = JSON.parse(files["dark.json"]!);
        dark.color.glow = { $value: "{color.brand.500}" };
        const { tokens, showing } = studioOn(
            demoMessage({ files: { ...files, "dark.json": JSON.stringify(dark) } }),
        ).state;

        expect(showing.token("color.glow")).toBeUndefined();
        expect(referable(tokens, showing, "color", "color.text.default")).toContain("color.glow");
    });
});

describe("hasField", () => {
    it("names the types with a field of their own", () => {
        expect(
            [
                "dimension",
                "duration",
                "number",
                "fontWeight",
                "fontFamily",
                "cubicBezier",
                "strokeStyle",
            ].every((type) => hasField(type as TokenType)),
        ).toBe(true);
        expect(
            ["color", "border", "transition", "shadow", "gradient", "typography"].some((type) =>
                hasField(type as TokenType),
            ),
        ).toBe(false);
    });
});

describe("draftFor", () => {
    it("starts a field's draft from the value shown", () => {
        expect(draftFor("dimension", { kind: "dimension", value: 2, unit: "rem" })).toEqual({
            kind: "dimension",
            amount: "2",
            unit: "rem",
        });
        expect(draftFor("cubicBezier", { kind: "cubicBezier", points: [0.4, 0, 0.2, 1] })).toEqual({
            kind: "cubicBezier",
            points: ["0.4", "0", "0.2", "1"],
        });
        expect(
            draftFor("fontFamily", { kind: "fontFamily", fonts: ["Inter"], alone: true }),
        ).toEqual({ kind: "fontFamily", fonts: ["Inter"], alone: true });
    });

    it("starts blank where nothing is written", () => {
        expect(draftFor("duration", undefined)).toEqual({ kind: "duration", amount: "", unit: "" });
        expect(draftFor("strokeStyle", undefined)).toEqual({ kind: "strokeStyle", keyword: "" });
        expect(draftFor("fontWeight", undefined)).toEqual({
            kind: "fontWeight",
            choice: "",
            amount: "",
        });
    });

    it("gives a keyword weight its number, ready for switching to Number", () => {
        expect(draftFor("fontWeight", { kind: "fontWeight", value: "bold" })).toEqual({
            kind: "fontWeight",
            choice: "bold",
            amount: "700",
        });
        expect(draftFor("fontWeight", { kind: "fontWeight", value: 650 })).toEqual({
            kind: "fontWeight",
            choice: "number",
            amount: "650",
        });
    });
});

describe("fieldFrom", () => {
    it("makes a field once the draft holds a whole value", () => {
        expect(fieldFrom({ kind: "dimension", amount: "1.5", unit: "rem" })).toEqual({
            kind: "dimension",
            value: 1.5,
            unit: "rem",
        });
        expect(fieldFrom({ kind: "number", amount: "1e2" })).toEqual({
            kind: "number",
            value: 100,
        });
        expect(fieldFrom({ kind: "fontWeight", choice: "number", amount: "700" })).toEqual({
            kind: "fontWeight",
            value: 700,
        });
        expect(fieldFrom({ kind: "fontWeight", choice: "bold", amount: "700" })).toEqual({
            kind: "fontWeight",
            value: "bold",
        });
        expect(fieldFrom({ kind: "cubicBezier", points: ["0", "0", "1", "1"] })).toEqual({
            kind: "cubicBezier",
            points: [0, 0, 1, 1],
        });
        expect(
            fieldFrom({ kind: "fontFamily", fonts: ["Inter", "sans-serif"], alone: false }),
        ).toEqual({ kind: "fontFamily", fonts: ["Inter", "sans-serif"], alone: false });
        expect(fieldFrom({ kind: "strokeStyle", keyword: "dotted" })).toEqual({
            kind: "strokeStyle",
            keyword: "dotted",
        });
    });

    it("makes nothing while the draft is half done", () => {
        const half = [
            { kind: "dimension", amount: "1.5", unit: "" },
            { kind: "dimension", amount: "", unit: "rem" },
            { kind: "dimension", amount: "1e", unit: "px" },
            { kind: "duration", amount: "fast", unit: "ms" },
            { kind: "number", amount: "-" },
            { kind: "fontWeight", choice: "", amount: "" },
            { kind: "fontWeight", choice: "number", amount: "" },
            { kind: "cubicBezier", points: ["0", "0", "1", ""] },
            { kind: "fontFamily", fonts: ["Inter", ""], alone: false },
            { kind: "fontFamily", fonts: [], alone: false },
            { kind: "strokeStyle", keyword: "" },
        ] as const;

        for (const draft of half) expect(fieldFrom(draft)).toBeUndefined();
    });
});

describe("says", () => {
    it("tells whether what is typed already means the value shown", () => {
        expect(says({ kind: "number", amount: "1e2" }, { kind: "number", value: 100 })).toBe(true);
        expect(says({ kind: "number", amount: "1.0" }, { kind: "number", value: 1 })).toBe(true);
        expect(says({ kind: "number", amount: "2" }, { kind: "number", value: 3 })).toBe(false);
        expect(
            says(
                { kind: "dimension", amount: "2", unit: "" },
                { kind: "dimension", value: 2, unit: "px" },
            ),
        ).toBe(false);
    });
});

describe("changes", () => {
    it("is false when the field writes what the file already says", () => {
        expect(
            changes({ kind: "dimension", value: 2, unit: "rem" }, { value: 2, unit: "rem" }),
        ).toBe(false);
        expect(changes({ kind: "reference", path: "a.b" }, "{a.b}")).toBe(false);
        expect(changes({ kind: "number", value: 2 }, 3)).toBe(true);
        expect(changes({ kind: "number", value: 2 }, undefined)).toBe(true);
    });
});

describe("moved and without", () => {
    it("moves an item in a list and takes one out", () => {
        expect(moved(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
        expect(moved(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
        expect(without(["a", "b", "c"], 1)).toEqual(["a", "c"]);
    });
});
