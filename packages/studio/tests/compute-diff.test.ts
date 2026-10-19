import { describe, expect, it } from "vitest";
import { computeDiff } from "../src/tokens/compute-diff";
import { PathIndex } from "../src/tokens/path-index";
import { groups, resolved, snapshot } from "./fixtures";

describe("computeDiff", () => {
    it("returns no entries when nothing changed", () => {
        const baselineMap = resolved({ path: "color.bg", value: "#fff" });
        const baseline = snapshot({ resolved: baselineMap });
        const pathIndex = new PathIndex(baselineMap);

        expect(
            computeDiff({ resolved: baselineMap, baseline: baseline, index: pathIndex }),
        ).toEqual([]);
    });

    it("emits a single leaf entry for a per-token change with the exact expected shape", () => {
        const baselineMap = resolved({ path: "color.bg", value: "#fff" });
        const current = resolved({ path: "color.bg", value: "#eee" });
        const baseline = snapshot({ resolved: baselineMap });
        const pathIndex = new PathIndex(baselineMap);

        const diff = computeDiff({ resolved: current, baseline: baseline, index: pathIndex });

        expect(diff).toEqual([
            {
                kind: "changed",
                handle: "color.bg",
                path: "color.bg",
                basePath: "color.bg",
                sourcePath: "tokens.json",
                contexts: [],
                from: { $value: "#fff" },
                to: { $value: "#eee" },
            },
        ]);
    });

    it("collapses identical changes across all permutations into contexts: []", () => {
        const baselineMap = resolved(
            { path: "color.bg", value: "#fff", context: "light" },
            { path: "color.bg", value: "#fff", context: "dark" },
        );
        const current = resolved(
            { path: "color.bg", value: "#eee", context: "light" },
            { path: "color.bg", value: "#eee", context: "dark" },
        );
        const baseline = snapshot({ resolved: baselineMap });
        const pathIndex = new PathIndex(baselineMap);

        const diff = computeDiff({ resolved: current, baseline: baseline, index: pathIndex });
        expect(diff).toHaveLength(1);
        expect(diff[0]?.contexts).toEqual([]);
    });

    it("skips paths the index knows about but the baseline doesn't", () => {
        const baselineMap = resolved({ path: "color.bg", value: "#fff" });
        const indexedFromOlderMap = resolved(
            { path: "color.bg", value: "#fff" },
            { path: "color.fg", value: "#000" },
        );
        const baseline = snapshot({ resolved: baselineMap });
        const pathIndex = new PathIndex(indexedFromOlderMap);

        expect(
            computeDiff({ resolved: baselineMap, baseline: baseline, index: pathIndex }),
        ).toEqual([]);
    });

    it("keeps contexts populated when only some permutations changed", () => {
        const baselineMap = resolved(
            { path: "color.bg", value: "#fff", context: "light" },
            { path: "color.bg", value: "#000", context: "dark" },
        );
        const current = resolved(
            { path: "color.bg", value: "#eee", context: "light" },
            { path: "color.bg", value: "#000", context: "dark" },
        );
        const baseline = snapshot({ resolved: baselineMap });
        const pathIndex = new PathIndex(baselineMap);

        const diff = computeDiff({ resolved: current, baseline: baseline, index: pathIndex });
        expect(diff).toHaveLength(1);
        expect(diff[0]?.contexts).toEqual(["light"]);
    });

    describe("group descriptions", () => {
        const baselineMap = {
            ...resolved({ path: "color.text.muted", value: "#666" }),
            ...groups({ path: "color.text", description: "Foreground roles" }),
        };

        it("emits an entry when a group's description changes", () => {
            const current = {
                ...resolved({ path: "color.text.muted", value: "#666" }),
                ...groups({ path: "color.text", description: "Text colours" }),
            };
            const baseline = snapshot({ resolved: baselineMap });

            expect(
                computeDiff({
                    resolved: current,
                    baseline: baseline,
                    index: new PathIndex(baselineMap),
                }),
            ).toEqual([
                {
                    kind: "changed",
                    handle: "color.text",
                    path: "color.text",
                    basePath: "color.text",
                    sourcePath: "tokens.json",
                    contexts: [],
                    from: { $description: "Foreground roles" },
                    to: { $description: "Text colours" },
                },
            ]);
        });

        it("emits an entry when a group gains a description it never had", () => {
            const bare = {
                ...resolved({ path: "color.text.muted", value: "#666" }),
                ...groups({ path: "color.text" }),
            };
            const current = {
                ...resolved({ path: "color.text.muted", value: "#666" }),
                ...groups({ path: "color.text", description: "Added" }),
            };

            const diff = computeDiff({
                resolved: current,
                baseline: snapshot({ resolved: bare }),
                index: new PathIndex(bare),
            });

            expect(diff).toEqual([
                {
                    kind: "changed",
                    handle: "color.text",
                    path: "color.text",
                    basePath: "color.text",
                    sourcePath: "tokens.json",
                    contexts: [],
                    from: { $description: undefined },
                    to: { $description: "Added" },
                },
            ]);
        });

        it("emits nothing when the group description is untouched", () => {
            const baseline = snapshot({ resolved: baselineMap });
            expect(
                computeDiff({
                    resolved: baselineMap,
                    baseline: baseline,
                    index: new PathIndex(baselineMap),
                }),
            ).toEqual([]);
        });
    });

    it("reports a description edit on a renamed group at its current path", () => {
        const before = {
            ...groups({ path: "color", description: "Old" }),
            ...resolved({ path: "color.bg", value: "#fff" }),
        };
        const after = {
            ...groups({ path: "palette", description: "New" }),
            ...resolved({ path: "palette.bg", value: "#fff" }),
        };
        const moved: Record<string, string> = { "palette": "color", "palette.bg": "color.bg" };

        const diff = computeDiff({
            resolved: after,
            baseline: snapshot({ resolved: before }),
            index: new PathIndex(after, (path) => moved[path] ?? path),
            baselineIndex: new PathIndex(before),
        });

        expect(diff).toContainEqual(
            expect.objectContaining({
                kind: "changed",
                handle: "color",
                path: "palette",
                basePath: "color",
                from: { $description: "Old" },
                to: { $description: "New" },
            }),
        );
    });
});
