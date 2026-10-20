import { describe, expect, it } from "vitest";
import { parsedJson } from "../../src/controllers/typed-text";

describe("parsedJson", () => {
    it("gives the value when the text is JSON", () => {
        expect(parsedJson('"{color.neutral.100}"')).toEqual({ value: "{color.neutral.100}" });
        expect(parsedJson('{ "value": 2, "unit": "rem" }')).toEqual({
            value: { value: 2, unit: "rem" },
        });
    });

    it("gives nothing when the text isn't JSON yet", () => {
        expect(parsedJson("{color.neutral.100}")).toBeUndefined();
        expect(parsedJson("")).toBeUndefined();
    });
});
