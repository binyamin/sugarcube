import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readOptions } from "@sugarcube-sh/core/client";
import { type Edits, setValue } from "@sugarcube-sh/dtcg-edit";
import { afterEach, describe, expect, it } from "vitest";
import { adapterFor } from "../../src/adapters";
import { createStudio } from "../../src/controllers/studio";
import type { SaveOutcome } from "../../src/protocol";
import { saveEdits } from "../../src/server/save";
import { demoCopy } from "../server/demo-copy";
import { demoMessage, studioOn } from "./demo-message";

const darkText = { input: { mode: "dark" } } as const;

function withHost(answer: (edits: Edits) => Promise<SaveOutcome>) {
    const sent: Edits[] = [];
    const studio = createStudio(demoMessage(), adapterFor, (edits) => {
        sent.push(edits);
        return answer(edits);
    });
    return { studio, sent };
}

let remove = () => {};
afterEach(() => remove());

describe("saving", () => {
    it("sends the unsaved edits, and has none left once the host has written them", async () => {
        const { studio, sent } = withHost(async () => ({ written: ["dark.json"], deleted: [] }));
        studio.do(
            setValue(studio.state.tokens, "color.text.default", "{color.neutral.100}", darkText),
        );
        const edits = sent.length;

        const saved = await studio.save?.();

        expect(edits).toBe(0);
        expect(sent).toHaveLength(1);
        expect(sent[0]?.ops).toHaveLength(1);
        expect(saved).toEqual({ written: ["dark.json"], deleted: [] });
        expect(studio.state.changes).toEqual([]);
    });

    it("keeps every edit when the host refuses the save, and gives its conflicts", async () => {
        const conflict = {
            op: { kind: "deleteFile", file: "x.json", was: "" },
            kind: "gone",
            reason: "x.json is gone",
        } as const;
        const { studio } = withHost(async () => ({ conflicts: [conflict] }));
        studio.do(
            setValue(studio.state.tokens, "color.text.default", "{color.neutral.100}", darkText),
        );

        const saved = await studio.save?.();

        expect(saved?.conflicts?.map(({ reason }) => reason)).toEqual(["x.json is gone"]);
        expect(studio.state.changes).toHaveLength(1);
    });

    it("keeps an edit made while the save was on its way as unsaved", async () => {
        let answer: (saved: SaveOutcome) => void = () => {};
        const { studio } = withHost(() => new Promise((resolve) => (answer = resolve)));
        studio.do(
            setValue(studio.state.tokens, "color.text.default", "{color.neutral.100}", darkText),
        );

        const saving = studio.save?.();
        studio.do(
            setValue(studio.state.tokens, "color.text.muted", "{color.neutral.300}", darkText),
        );
        answer({ written: ["dark.json"], deleted: [] });
        await saving;

        expect(studio.state.changes.map(({ path }) => path)).toContain("color.text.muted");
    });

    it("offers no save when the host gives none, as a static build", () => {
        expect(studioOn().save).toBeUndefined();
    });

    it("writes the edits into the files on disk through the host's save", async () => {
        const copy = demoCopy();
        remove = copy.remove;
        const onDisk = { entry: copy.config.resolver, options: readOptions(copy.config) };
        const studio = createStudio(demoMessage(), adapterFor, (edits) =>
            saveEdits(onDisk, JSON.parse(JSON.stringify(edits))),
        );
        studio.do(
            setValue(studio.state.tokens, "color.text.default", "{color.neutral.100}", darkText),
        );

        expect(await studio.save?.()).toEqual({ written: ["dark.json"], deleted: [] });
        expect(readFileSync(join(copy.dir, "dark.json"), "utf8")).toContain("{color.neutral.100}");
        expect(studio.state.changes).toEqual([]);
    });
});
