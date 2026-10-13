import { describe, expect, it } from "vitest";
import { isReference, parseDimension, parseNumber, readReference } from "../../src/values.js";

describe("isReference", () => {
    it("recognises the references a parser reads, in either syntax", () => {
        const curly = parseNumber("{ratio.golden}", []);
        const pointer = parseNumber({ $ref: "#/ratio/golden/$value" }, []);
        expect(curly.ok && isReference(curly.value)).toBe(true);
        expect(pointer.ok && isReference(pointer.value)).toBe(true);
        expect(curly.ok && isReference(curly.value) && curly.value.syntax).toBe("curly-brace");
        expect(pointer.ok && isReference(pointer.value) && pointer.value.syntax).toBe(
            "json-pointer",
        );
    });

    it("recognises a pointer in place of part of a value", () => {
        const dimension = parseDimension(
            { value: { $ref: "#/size/base/$value/value" }, unit: "rem" },
            [],
        );
        if (!dimension.ok || isReference(dimension.value)) {
            expect.unreachable("a dimension with a pointer for its value");
        }
        expect(isReference(dimension.value.value)).toBe(true);
    });

    it.for([
        1.5,
        "{ratio.golden}",
        { $ref: "#/x" },
        { syntax: "curly-brace", path: 1 },
        { syntax: "json-pointer", path: "x" },
        { path: "x" },
        null,
    ])("does not take %j, as written in a file or malformed, for a read reference", (value) => {
        expect(isReference(value)).toBe(false);
    });
});

describe("readReference", () => {
    it("reads a reference as written in a file", () => {
        expect(readReference("{color.brand}")).toStrictEqual({
            syntax: "curly-brace",
            path: "color.brand",
        });
        expect(readReference({ $ref: "#/color/brand" })).toStrictEqual({
            syntax: "json-pointer",
            pointer: "#/color/brand",
        });
    });

    it.for([16, "color.brand", "{}", { $ref: 1 }, { $ref: "#/a", other: 1 }, null])(
        "reads %j as no reference",
        (raw) => {
            expect(readReference(raw)).toBeUndefined();
        },
    );
});
