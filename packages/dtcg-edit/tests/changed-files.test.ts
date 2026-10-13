import { describe, expect, it } from "vitest";
import { type FileOp, changedFiles, setValue } from "../src/index.js";
import { demo, opsOf } from "./helpers.js";

const half = { value: 0.5, unit: "rem" };
const gradientSource = { $ref: "./gradient.json" };
const sources = ["resolutionOrder", 0, "sources"];
const listed = JSON.parse(demo.files["tokens.resolver.json"] ?? "").resolutionOrder[0].sources;

const unnamed: FileOp = {
    kind: "remove",
    file: "tokens.resolver.json",
    path: [...sources, 8],
    was: gradientSource,
};

describe("changedFiles", () => {
    it("gives the new text of each file the edits change, and no other", () => {
        const result = changedFiles(demo, opsOf(setValue(demo, "radius.md", half)));
        if ("conflicts" in result) throw new Error("conflicts");

        expect(Object.keys(result.written)).toStrictEqual(["radius.json"]);
        expect(JSON.parse(result.written["radius.json"] ?? "").radius.md.$value).toEqual(half);
        expect(result.deleted).toStrictEqual([]);
    });

    it("deletes a file only when an edit deletes it", () => {
        const deleting: FileOp = {
            kind: "deleteFile",
            file: "gradient.json",
            was: demo.files["gradient.json"] ?? "",
        };
        const result = changedFiles(demo, [unnamed, deleting]);
        if ("conflicts" in result) throw new Error("conflicts");

        expect(result.deleted).toStrictEqual(["gradient.json"]);
        expect(Object.keys(result.written)).toStrictEqual(["tokens.resolver.json"]);
    });

    it("keeps a file the resolver stops naming", () => {
        const result = changedFiles(demo, [unnamed]);
        if ("conflicts" in result) throw new Error("conflicts");

        expect(result.deleted).toStrictEqual([]);
        expect(Object.keys(result.written)).toStrictEqual(["tokens.resolver.json"]);
        expect(result.project.files["gradient.json"]).toBeUndefined();
    });

    it("writes a new file", () => {
        const result = changedFiles(demo, [
            { kind: "createFile", file: "extra.json", value: {} },
            {
                kind: "set",
                file: "tokens.resolver.json",
                path: sources,
                value: [...listed, { $ref: "./extra.json" }],
                was: listed,
            },
        ]);
        if ("conflicts" in result) throw new Error("conflicts");

        expect(Object.keys(result.written).sort()).toStrictEqual([
            "extra.json",
            "tokens.resolver.json",
        ]);
        expect(JSON.parse(result.written["extra.json"] ?? "")).toStrictEqual({});
    });

    it("gives the conflicts, and nothing to write, when an edit no longer applies", () => {
        const stale: FileOp = {
            kind: "set",
            file: "radius.json",
            path: ["radius", "md", "$value"],
            value: half,
            was: "not what is there",
        };
        expect(changedFiles(demo, [stale])).toMatchObject({ conflicts: [{ kind: "changed" }] });
    });
});
