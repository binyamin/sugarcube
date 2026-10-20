import type { JsonValue } from "@sugarcube-sh/dtcg";
import { describe, expect, it } from "vitest";
import { partsOf, withAdded, withRemoved } from "../../src/controllers/parts";
import { fieldFor } from "../../src/controllers/value-field";

const px = (value: number) => ({ value, unit: "px" });
const layer = { color: "#0000001a", offsetX: px(0), offsetY: px(1), blur: px(2), spread: px(0) };

describe("partsOf", () => {
    it("gives a shadow layer's parts, its optional inset among them", () => {
        expect(
            partsOf("shadow", { ...layer, inset: true })?.map(({ name, type }) => [name, type]),
        ).toEqual([
            ["color", "color"],
            ["offsetX", "dimension"],
            ["offsetY", "dimension"],
            ["blur", "dimension"],
            ["spread", "dimension"],
            ["inset", "boolean"],
        ]);
    });

    it("gives nothing for a value it can't show exactly", () => {
        expect(partsOf("shadow", { ...layer, glow: true })).toBeUndefined();
        expect(partsOf("gradient", "{gradient.stop}")).toBeUndefined();
    });
});

describe("withAdded and withRemoved", () => {
    const list = (written: JsonValue) => {
        const field = fieldFor("shadow", written);
        if (field.kind !== "list") throw new Error(field.kind);
        return field;
    };
    const dashes = (written: JsonValue) => {
        const field = fieldFor("strokeStyle", written);
        if (field.kind !== "dashes") throw new Error(field.kind);
        return field;
    };

    it("adds a copy of the last item, making a single shadow a list", () => {
        expect(withAdded(list(layer))).toEqual([layer, layer]);
        expect(withAdded(list([layer, "{shadow.sm}"]))).toEqual([
            layer,
            "{shadow.sm}",
            "{shadow.sm}",
        ]);
        expect(withAdded(dashes({ dashArray: [px(4)], lineCap: "round" }))).toEqual({
            dashArray: [px(4), px(4)],
            lineCap: "round",
        });
    });

    it("takes one out, keeping a list a list", () => {
        expect(withRemoved(list([layer, "{shadow.sm}"]), 0)).toEqual(["{shadow.sm}"]);
        expect(withRemoved(dashes({ dashArray: [px(4), px(8)], lineCap: "butt" }), 1)).toEqual({
            dashArray: [px(4)],
            lineCap: "butt",
        });
    });
});
