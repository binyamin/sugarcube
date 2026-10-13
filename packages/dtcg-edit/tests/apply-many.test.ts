import { openFromMemory } from "@sugarcube-sh/dtcg";
import * as jsonc from "jsonc-parser";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    type FileOp,
    type OpResult,
    apply,
    commit,
    create,
    remove,
    rename,
    setDescription,
    setValue,
} from "../src/index.js";
import { project as sized } from "./benchmarks/projects.js";
import { at, demo } from "./helpers.js";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("applying many edits to one file", () => {
    it("gives what applying them one at a time gives", () => {
        const result = rename(demo, "color.brand", "primary");
        const ops = "ops" in result ? result.ops : [];
        const oneByOne = ops.reduce((project, op) => {
            const next = apply(project, [op]);
            if ("conflicts" in next) throw new Error(JSON.stringify(next.conflicts));
            return next;
        }, demo);
        const together = apply(demo, ops);

        if ("conflicts" in together) throw new Error(JSON.stringify(together.conflicts));
        expect(together.files).toEqual(oneByOne.files);
    });

    it("gives what applying them one at a time gives when they touch or sit inside each other", () => {
        const red = { colorSpace: "srgb", components: [1, 0, 0] };
        const steps: OpResult[] = [];
        let project = demo;
        for (const operation of [
            (p: typeof demo) => setValue(p, "color.brand.500", red),
            (p: typeof demo) => setDescription(p, "color.brand.500", "The anchor, again."),
            (p: typeof demo) => setValue(p, "color.brand.600", red),
            (p: typeof demo) => remove(p, "color.brand.400"),
            (p: typeof demo) => create(p, "color.brand.450", { $value: red }),
            (p: typeof demo) => setDescription(p, "color.brand", "Renamed soon."),
            (p: typeof demo) => rename(p, "color.brand", "house"),
            (p: typeof demo) => setValue(p, "color.house.700", red),
        ]) {
            const result = operation(project);
            steps.push(result);
            const done = commit(project, result);
            if (!("project" in done)) throw new Error(JSON.stringify(done));
            project = done.project;
        }
        const ops = steps.flatMap((step) => ("ops" in step ? step.ops : []));
        const together = apply(demo, ops);

        if ("conflicts" in together) throw new Error(JSON.stringify(together.conflicts));
        expect(together.files).toEqual(project.files);
    });

    it("refuses a second key renamed to the name the first just took", () => {
        const project = openFromMemory({
            files: {
                "tokens.json":
                    '{ "a": { "$type": "number", "$value": 1 }, "b": { "$type": "number", "$value": 2 } }',
            },
        });
        const renamedTo = (key: string): FileOp => ({
            kind: "renameKey",
            file: "tokens.json",
            path: [key],
            name: "x",
            was: at(project, "tokens.json", [key]) ?? null,
        });

        expect(apply(project, [renamedTo("a"), renamedTo("b")])).toEqual({
            conflicts: [expect.objectContaining({ kind: "taken" })],
        });
    });

    it("refuses an edit through a key an earlier edit renamed", () => {
        const project = openFromMemory({
            files: { "tokens.json": '{\n  "a": { "$type": "number", "$value": 1 }\n}\n' },
        });
        const ops: FileOp[] = [
            {
                kind: "renameKey",
                file: "tokens.json",
                path: ["a"],
                name: "b",
                was: at(project, "tokens.json", ["a"]) ?? null,
            },
            { kind: "set", file: "tokens.json", path: ["a", "$value"], value: 2, was: 1 },
        ];

        expect(apply(project, ops)).toEqual({
            conflicts: [expect.objectContaining({ kind: "gone" })],
        });
    });

    it("deletes a file as an earlier edit in the same list left it", () => {
        const project = openFromMemory({
            files: {
                "tokens.resolver.json": JSON.stringify({
                    version: "2025.10",
                    resolutionOrder: [
                        { type: "set", name: "base", sources: [{ $ref: "./base.json" }] },
                    ],
                }),
                "base.json": '{\n  "a": { "$type": "number", "$value": 1 }\n}\n',
            },
        });
        const edited = '{\n  "a": { "$type": "number", "$value": 2 }\n}\n';
        const ops: FileOp[] = [
            { kind: "set", file: "base.json", path: ["a", "$value"], value: 2, was: 1 },
            { kind: "deleteFile", file: "base.json", was: edited },
        ];
        const after = apply(project, ops);

        if ("conflicts" in after) throw new Error(JSON.stringify(after.conflicts));
        expect(after.files["base.json"]).toBeUndefined();
    });

    it("parses a file a few times, not once an edit", () => {
        const opened = sized(60);
        const result = rename(opened, "color", "colour");
        const ops = "ops" in result ? result.ops : [];
        const counted = vi.spyOn(jsonc, "parseTree");
        apply(opened, ops);

        expect(ops.length).toBeGreaterThan(40);
        expect(counted.mock.calls.length).toBeLessThan(20);
    });
});
