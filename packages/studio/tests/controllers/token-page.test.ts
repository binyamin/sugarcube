import { setValue } from "@sugarcube-sh/dtcg-edit";
import { describe, expect, it } from "vitest";
import { parsedJson, placeRows } from "../../src/controllers/token-page";
import { studioOn } from "./demo-message";

describe("placeRows", () => {
    it("labels each place by the theme whose file writes it, or the set it is shared through", () => {
        const { tokens } = studioOn().state;

        expect(
            placeRows(tokens, "color.text.default").map((row) => [row.label, row.value]),
        ).toEqual([
            ["base", "{color.neutral.900}"],
            ["mode: dark", "{color.neutral.50}"],
        ]);
    });

    it("gives no label where there is no resolver, so nothing to tell apart", () => {
        const { tokens } = studioOn({
            adapter: { name: "plain", settings: {}, problems: [] },
            entry: "tokens.json",
            files: {
                "tokens.json": JSON.stringify({
                    space: { $type: "dimension", s: { $value: { value: 4, unit: "px" } } },
                }),
            },
        }).state;

        expect(placeRows(tokens, "space.s").map((row) => [row.label, row.value])).toEqual([
            [undefined, { value: 4, unit: "px" }],
        ]);
    });

    it("lets an edit at a row change exactly that row's file", () => {
        const studio = studioOn();
        const [base] = placeRows(studio.state.tokens, "color.text.default");

        studio.do(
            setValue(studio.state.tokens, "color.text.default", "{color.neutral.800}", {
                at: base!.at,
            }),
        );

        expect(
            placeRows(studio.state.tokens, "color.text.default").map((row) => row.value),
        ).toEqual(["{color.neutral.800}", "{color.neutral.50}"]);
    });
});

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
