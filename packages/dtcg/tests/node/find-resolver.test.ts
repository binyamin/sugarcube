import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findResolver } from "../../src/node.js";

let folder: string;

beforeEach(async () => {
    folder = await realpath(await mkdtemp(join(tmpdir(), "dtcg-find-")));
});

afterEach(async () => {
    await rm(folder, { recursive: true, force: true });
});

const resolver = JSON.stringify({ version: "2025.10", resolutionOrder: [] });
const tokens = JSON.stringify({ color: { $type: "color" } });

async function files(written: Record<string, string>): Promise<void> {
    for (const [path, text] of Object.entries(written)) {
        await mkdir(dirname(join(folder, path)), { recursive: true });
        await writeFile(join(folder, path), text);
    }
}

const at = (path: string) => join(folder, path);

describe("findResolver, by name", () => {
    it("finds the one file named .resolver.json, however deep", async () => {
        await files({
            "src/tokens/tokens.resolver.json": resolver,
            "src/tokens/base.json": tokens,
        });
        expect(await findResolver(folder)).toStrictEqual({
            kind: "one",
            path: at("src/tokens/tokens.resolver.json"),
        });
    });

    it("gives several, in order, rather than choosing one", async () => {
        await files({ "b/b.resolver.json": resolver, "a/a.resolver.json": resolver });
        expect(await findResolver(folder)).toStrictEqual({
            kind: "several",
            paths: [at("a/a.resolver.json"), at("b/b.resolver.json")],
        });
    });

    it("finds none where a resolver has another name", async () => {
        await files({ "resolver.json": resolver, "package.json": '{ "version": "1.0.0" }' });
        expect(await findResolver(folder)).toStrictEqual({ kind: "none" });
    });

    it("skips dependency, build and hidden folders", async () => {
        await files({
            "node_modules/kit/kit.resolver.json": resolver,
            "dist/copy.resolver.json": resolver,
            ".git/x.resolver.json": resolver,
            ".storybook/stories.resolver.json": resolver,
            "build/copy.resolver.json": resolver,
            "tokens.resolver.json": resolver,
        });
        expect(await findResolver(folder)).toStrictEqual({
            kind: "one",
            path: at("tokens.resolver.json"),
        });
    });

    it("checks a file it is given by its name", async () => {
        await files({ "tokens.resolver.json": resolver, "resolver.json": resolver });
        expect(await findResolver([at("resolver.json")])).toStrictEqual({ kind: "none" });
        expect(await findResolver([at("tokens.resolver.json")])).toStrictEqual({
            kind: "one",
            path: at("tokens.resolver.json"),
        });
    });

    it("searches folders and checks files given together", async () => {
        await files({ "a/a.resolver.json": resolver, "b.resolver.json": resolver });
        expect(await findResolver([at("a"), at("b.resolver.json")])).toStrictEqual({
            kind: "several",
            paths: [at("a/a.resolver.json"), at("b.resolver.json")],
        });
    });
    it("counts a file once when it is given and also inside a folder given", async () => {
        await files({ "tokens/tokens.resolver.json": resolver });
        expect(await findResolver([at("tokens"), at("tokens/tokens.resolver.json")])).toStrictEqual(
            { kind: "one", path: at("tokens/tokens.resolver.json") },
        );
    });
});

describe("findResolver, by content", () => {
    it("finds a resolver whatever its name, by its top-level resolutionOrder", async () => {
        await files({ "resolver.json": resolver, "base.json": tokens });
        expect(await findResolver(folder, { by: "content" })).toStrictEqual({
            kind: "one",
            path: at("resolver.json"),
        });
    });

    it("finds none in a file that only mentions resolutionOrder inside", async () => {
        await files({
            "package.json": '{ "version": "1.0.0" }',
            "notes.json": JSON.stringify({ example: { resolutionOrder: [] } }),
            "words.json": JSON.stringify({ text: '"resolutionOrder"' }),
        });
        expect(await findResolver(folder, { by: "content" })).toStrictEqual({ kind: "none" });
    });

    it("still finds a file named .resolver.json that lacks resolutionOrder, so its read says why", async () => {
        await files({ "broken.resolver.json": '{ "version": "2025.10" }' });
        expect(await findResolver(folder, { by: "content" })).toStrictEqual({
            kind: "one",
            path: at("broken.resolver.json"),
        });
    });

    it("gives several when one is named and another is not", async () => {
        await files({ "tokens.resolver.json": resolver, "example.json": resolver });
        expect(await findResolver(folder, { by: "content" })).toStrictEqual({
            kind: "several",
            paths: [at("example.json"), at("tokens.resolver.json")],
        });
    });

    it("checks a file it is given by what is inside it", async () => {
        await files({ "resolver.json": resolver });
        expect(await findResolver([at("resolver.json")], { by: "content" })).toStrictEqual({
            kind: "one",
            path: at("resolver.json"),
        });
    });
});
