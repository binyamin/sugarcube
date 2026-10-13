import { openFromMemory } from "@sugarcube-sh/dtcg";
import { describe, expect, it, vi } from "vitest";
import {
    type FileOp,
    create,
    createSession,
    remove,
    rename,
    setDescription,
    setValue,
} from "../src/index.js";
import { demo, changed } from "./helpers.js";
const red = { colorSpace: "srgb", components: [1, 0, 0] };
const blue = { colorSpace: "srgb", components: [0, 0, 1] };

describe("adopt", () => {
    it("takes files changed on disk as they are when nothing is unsaved", () => {
        const session = createSession(demo);
        const fresh = changed(demo, [
            ["radius.json", ["radius", "md", "$value"], { value: 0.75, unit: "rem" }],
        ]);

        expect(session.adopt(fresh)).toEqual([]);
        expect(session.project.files).toEqual(fresh.files);
        expect(session.opened).toBe(fresh);
        expect(session.unsaved).toEqual({ ops: [], moved: [] });
        expect(session.changes()).toEqual([]);
    });

    it("keeps your edit and theirs when they are to different tokens in one file", () => {
        const session = createSession(demo);
        session.do(setValue(session.project, "color.brand.500", red));
        const fresh = changed(demo, [["color.json", ["color", "brand", "600", "$value"], blue]]);

        expect(session.adopt(fresh)).toEqual([]);
        expect(session.project.doc.permutation().token("color.brand.500")?.authored?.value).toEqual(
            red,
        );
        expect(session.project.doc.permutation().token("color.brand.600")?.authored?.value).toEqual(
            blue,
        );
        expect(session.unsaved.ops).toHaveLength(1);
        expect(session.changes().map((change) => change.path)).toEqual(["color.brand.500"]);
    });

    it("takes a file you haven't touched, and puts your edits back on one you have", () => {
        const session = createSession(demo);
        session.do(setValue(session.project, "color.brand.500", red));
        const fresh = changed(demo, [
            ["radius.json", ["radius", "md", "$value"], { value: 0.75, unit: "rem" }],
        ]);

        session.adopt(fresh);
        expect(session.project.files["radius.json"]).toBe(fresh.files["radius.json"]);
        expect(session.project.doc.permutation().token("color.brand.500")?.authored?.value).toEqual(
            red,
        );
    });

    it("hands back one clash when you both changed a token, and shows theirs", () => {
        const session = createSession(demo);
        session.do(setValue(session.project, "color.brand.500", red));
        const fresh = changed(demo, [["color.json", ["color", "brand", "500", "$value"], blue]]);

        expect(session.adopt(fresh)).toEqual([
            {
                path: "color.brand.500",
                file: "color.json",
                yours: expect.objectContaining({ $value: red }),
                theirs: expect.objectContaining({ $value: blue }),
            },
        ]);
        expect(session.project).toBe(fresh);
        expect(session.unsaved).toEqual({ ops: [], moved: [] });
    });

    it("gives your version of a clashing token with every edit of yours to it, those that fit too", () => {
        const session = createSession(demo);
        session.do(setDescription(session.project, "color.brand.500", "Mine."));
        session.do(setValue(session.project, "color.brand.500", red));
        const fresh = changed(demo, [["color.json", ["color", "brand", "500", "$value"], blue]]);

        expect(session.adopt(fresh)).toEqual([
            {
                path: "color.brand.500",
                file: "color.json",
                yours: { $value: red, $description: "Mine." },
                theirs: expect.objectContaining({ $value: blue }),
            },
        ]);
    });

    it("hands back a clash with no theirs when they removed the token you changed", () => {
        const session = createSession(demo);
        session.do(setValue(session.project, "color.brand.500", red));
        const fresh = changed(demo, [["color.json", ["color", "brand", "500"], undefined]]);

        expect(session.adopt(fresh)).toEqual([
            {
                path: "color.brand.500",
                file: "color.json",
                yours: { $value: red },
            },
        ]);
    });

    it("names a clash on a token written in the resolver by its token path", () => {
        const inline = (value: number) =>
            JSON.stringify({
                version: "2025.10",
                sets: {
                    base: { sources: [{ size: { $type: "number", sm: { $value: value } } }] },
                },
                resolutionOrder: [{ $ref: "#/sets/base" }],
            });
        const opened = openFromMemory({
            files: { "tokens.resolver.json": inline(1) },
            entry: "tokens.resolver.json",
        });
        const session = createSession(opened);
        session.do(setValue(session.project, "size.sm", 2));
        const fresh = openFromMemory({
            files: { "tokens.resolver.json": inline(3) },
            entry: "tokens.resolver.json",
        });

        expect(session.adopt(fresh)).toEqual([
            {
                path: "size.sm",
                file: "tokens.resolver.json",
                yours: { $value: 2 },
                theirs: { $value: 3 },
            },
        ]);
    });

    it("discards to what the files say now, not to what they said when opened", () => {
        const session = createSession(demo);
        session.do(setValue(session.project, "color.brand.500", red));
        const fresh = changed(demo, [
            ["radius.json", ["radius", "md", "$value"], { value: 0.75, unit: "rem" }],
        ]);
        session.adopt(fresh);
        session.discard();

        expect(session.project).toBe(fresh);
    });

    it("keeps the id of a path still there, forgets one gone, and gives a new path a new one", () => {
        const session = createSession(demo);
        session.do(create(session.project, "color.highlight", { $type: "color", $value: red }));
        const made = session.idOf("color.highlight");
        const fresh = changed(demo, [
            ["radius.json", ["radius", "md"], undefined],
            ["radius.json", ["radius", "xl"], { $value: { value: 2, unit: "rem" } }],
        ]);
        session.adopt(fresh);

        expect(session.idOf("radius.sm")).toBe("radius.sm");
        expect(session.pathOf("radius.md")).toBeUndefined();
        const arrived = session.idOf("radius.xl");
        expect(arrived).toMatch(/^new:/);
        expect(session.idOf("color.highlight")).toBe(made);

        session.discard();
        expect(session.idOf("radius.xl")).toBe(arrived);
        expect(session.pathOf(made ?? "")).toBeUndefined();
    });

    it("drops the move of a rename that no longer fits, and keeps the change list honest", () => {
        const session = createSession(demo);
        session.do(rename(session.project, "radius.md", "medium"));
        const fresh = changed(demo, [["radius.json", ["radius", "md"], undefined]]);

        expect(session.adopt(fresh)).toMatchObject([{ path: "radius.md", file: "radius.json" }]);
        expect(session.unsaved).toEqual({ ops: [], moved: [] });
        expect(session.changes()).toEqual([]);
    });

    it("keeps the moves of renames made one after another when they fit", () => {
        const session = createSession(demo);
        session.do(rename(session.project, "radius.md", "medium"));
        session.do(rename(session.project, "radius.medium", "mid"));
        const fresh = changed(demo, [
            ["radius.json", ["radius", "lg", "$value"], { value: 1, unit: "rem" }],
        ]);

        expect(session.adopt(fresh)).toEqual([]);
        expect(session.unsaved.moved).toEqual([
            { from: "radius.md", to: "radius.medium" },
            { from: "radius.medium", to: "radius.mid" },
        ]);
        expect(session.changes().map(({ kind, path }) => [kind, path])).toEqual([
            ["renamed", "radius.mid"],
        ]);
    });

    it("tells listeners", () => {
        const session = createSession(demo);
        const heard = vi.fn();
        session.subscribe(heard);
        session.adopt(
            changed(demo, [
                ["radius.json", ["radius", "md", "$value"], { value: 0.75, unit: "rem" }],
            ]),
        );

        expect(heard).toHaveBeenCalledTimes(1);
    });
});

describe("restore", () => {
    it("puts edits kept from before a reload back as unsaved, and discard still goes back to disk", () => {
        const before = createSession(demo);
        before.do(setValue(before.project, "color.text.brand", "{color.brand.800}"));
        before.do(remove(before.project, "radius.full"));
        const kept = before.unsaved;

        const session = createSession(demo);
        expect(session.restore(kept)).toEqual([]);
        expect(session.unsaved).toEqual(kept);
        expect(session.project.files).toEqual(before.project.files);

        session.discard();
        expect(session.project).toBe(demo);
    });

    it("keeps ids through the renames it puts back", () => {
        const before = createSession(demo);
        before.do(rename(before.project, "radius.md", "medium"));
        before.do(rename(before.project, "radius", "corner"));

        const session = createSession(demo);
        session.restore(before.unsaved);

        expect(session.pathOf("radius.md")).toBe("corner.medium");
        expect(session.pathOf("radius.sm")).toBe("corner.sm");
        expect(session.unsaved).toEqual(before.unsaved);
        expect(session.changes().map((change) => [change.kind, change.path])).toContainEqual([
            "renamed",
            "corner.medium",
        ]);
    });

    it("puts back the edits that fit and hands back a clash for each that doesn't", () => {
        const before = createSession(demo);
        before.do(setValue(before.project, "color.brand.500", red));
        before.do(setValue(before.project, "radius.md", { value: 1, unit: "rem" }));
        const kept = before.unsaved;
        const moved = changed(demo, [["color.json", ["color", "brand", "500", "$value"], blue]]);

        const session = createSession(moved);
        expect(session.restore(kept)).toEqual([
            {
                path: "color.brand.500",
                file: "color.json",
                yours: expect.objectContaining({ $value: red }),
                theirs: expect.objectContaining({ $value: blue }),
            },
        ]);
        expect(session.project.doc.permutation().token("radius.md")?.authored?.value).toEqual({
            value: 1,
            unit: "rem",
        });
        expect(session.unsaved.ops).toHaveLength(1);
    });

    it("puts back only the moves of the renames that fit", () => {
        const before = createSession(demo);
        before.do(rename(before.project, "radius.md", "medium"));
        before.do(rename(before.project, "radius.sm", "small"));
        const elsewhere = changed(demo, [["radius.json", ["radius", "md"], undefined]]);

        const session = createSession(elsewhere);
        session.restore(before.unsaved);
        expect(session.unsaved.moved).toEqual([{ from: "radius.sm", to: "radius.small" }]);
    });

    it("hands back a clash for an edit to a file that is gone", () => {
        const op: FileOp = {
            kind: "set",
            file: "gone.json",
            path: ["glow", "$value"],
            value: 1,
            was: 0,
        };
        const session = createSession(demo);

        const heard = vi.fn();
        session.subscribe(heard);
        expect(session.restore({ ops: [op], moved: [] })).toEqual([
            { path: "glow", file: "gone.json", yours: { $value: 1 } },
        ]);
        expect(session.project).toBe(demo);
        expect(heard).not.toHaveBeenCalled();
    });
});
