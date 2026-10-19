import { setValue } from "@sugarcube-sh/dtcg-edit";
import { describe, expect, it } from "vitest";
import { demoMessage, studioOn, withFile } from "./demo-message";

const darkText = { input: { mode: "dark" } } as const;

function changedOnDisk() {
    const dark = demoMessage().files["dark.json"] ?? "";
    return withFile("dark.json", dark.replace("{color.neutral.50}", "{color.neutral.200}"));
}

describe("clashes", () => {
    it("come from a change on disk to a value you edited", () => {
        const studio = studioOn();
        studio.do(
            setValue(studio.state.tokens, "color.text.default", "{color.neutral.100}", darkText),
        );

        studio.receive(changedOnDisk());

        expect(
            studio.state.clashes.map(({ path, yours, theirs }) => [path, yours, theirs]),
        ).toEqual([
            [
                "color.text.default",
                { $value: "{color.neutral.100}" },
                { $value: "{color.neutral.200}" },
            ],
        ]);
    });

    it("are none from a change on disk to a value you didn't edit", () => {
        const studio = studioOn();
        studio.do(setValue(studio.state.tokens, "radius.md", { value: 0.5, unit: "rem" }));

        studio.receive(changedOnDisk());

        expect(studio.state.clashes).toEqual([]);
        expect(studio.state.changes.map(({ path }) => path)).toEqual(["radius.md"]);
    });

    it("go once the edits are discarded", () => {
        const studio = studioOn();
        studio.do(
            setValue(studio.state.tokens, "color.text.default", "{color.neutral.100}", darkText),
        );
        studio.receive(changedOnDisk());

        studio.discard();

        expect(studio.state.clashes).toEqual([]);
    });
});
