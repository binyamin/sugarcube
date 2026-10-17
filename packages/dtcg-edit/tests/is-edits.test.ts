import { describe, expect, it } from "vitest";
import { createSession, isEdits, remove, setValue } from "../src/index.js";
import { demo } from "./helpers.js";
describe("isEdits", () => {
    it("is true for a session's unsaved edits, sent as JSON and read back", () => {
        const session = createSession(demo);
        session.do(setValue(session.tokens, "color.text.brand", "{color.brand.800}"));
        session.do(remove(session.tokens, "radius.full"));
        const sent = { ...session.unsaved, moved: [{ from: "radius.md", to: "radius.medium" }] };

        expect(isEdits(JSON.parse(JSON.stringify(sent)))).toBe(true);
        expect(isEdits({ ops: [], moved: [] })).toBe(true);
    });

    it("is false for anything that isn't edits, so a crafted request or link goes no further", () => {
        const crafted = [
            null,
            [],
            "edits",
            { ops: [] },
            { ops: [{ kind: "bogus", file: "color.json" }], moved: [] },
            {
                ops: [{ kind: "set", file: "color.json", path: "color", value: 1, was: 0 }],
                moved: [],
            },
            {
                ops: [{ kind: "set", file: "color.json", jsonPath: ["color"], value: 1 }],
                moved: [],
            },
            { ops: [{ kind: "add", file: 7, jsonPath: ["color"], value: 1 }], moved: [] },
            { ops: [{ kind: "add", file: "color.json", jsonPath: [{}], value: 1 }], moved: [] },
            {
                ops: [{ kind: "renameKey", file: "color.json", jsonPath: ["a"], was: 1 }],
                moved: [],
            },
            { ops: [{ kind: "deleteFile", file: "color.json", was: 1 }], moved: [] },
            { ops: [], moved: [{ from: "a" }] },
        ];
        for (const value of crafted) expect(isEdits(value), JSON.stringify(value)).toBe(false);
    });
});
