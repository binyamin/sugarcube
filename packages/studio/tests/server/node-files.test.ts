import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { FileWatcher } from "@sugarcube-sh/dtcg/node";
import { createSession, setValue } from "@sugarcube-sh/dtcg-edit";
import { readFromMemory } from "@sugarcube-sh/dtcg";
import { readOptions } from "@sugarcube-sh/core/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nodeFiles } from "../../src/server/node-files";
import { demoCopy } from "./demo-copy";

let remove = () => {};
afterEach(() => remove());

function watcher() {
    const added: string[] = [];
    const listeners: Record<string, ((path: string) => void)[]> = {};
    const given: FileWatcher = {
        add: (paths) => added.push(...(typeof paths === "string" ? [paths] : paths)),
        on: (event, listener) => (listeners[event] ??= []).push(listener),
    };
    return { given, added, change: (path: string) => listeners.change?.forEach((fn) => fn(path)) };
}

async function demo() {
    const copy = demoCopy();
    remove = copy.remove;
    const files = await nodeFiles(copy.config, {
        onError: (error) => {
            throw error;
        },
    });
    return { ...copy, files };
}

describe("nodeFiles", () => {
    it("sends every file the tokens are read from", async () => {
        const { dir, files } = await demo();

        const { files: sent } = files.message();

        expect(sent["dark.json"]).toBe(readFileSync(join(dir, "dark.json"), "utf8"));
        expect(sent["tokens.resolver.json"]).toBeDefined();
    });

    it("watches every file the tokens are read from", async () => {
        const { dir, files } = await demo();
        const { given, added } = watcher();

        files.watch(given);

        expect(added).toContain(join(dir, "dark.json"));
        expect(added).toContain(join(dir, "color.json"));
    });

    it("sends the files again when one changes on disk", async () => {
        const { dir, files } = await demo();
        const { given, change } = watcher();
        files.watch(given);
        const changed = new Promise<void>((resolve) => files.onChange(resolve));
        const path = join(dir, "dark.json");
        const edited = readFileSync(path, "utf8").replace(
            "{color.neutral.50}",
            "{color.neutral.100}",
        );

        writeFileSync(path, edited);
        change(path);
        await changed;

        expect(files.message().files["dark.json"]).toBe(edited);
    });

    it("stops telling a listener once it stops listening", async () => {
        const { dir, files } = await demo();
        const { given, change } = watcher();
        files.watch(given);
        const listener = vi.fn();
        const stop = files.onChange(listener);
        const told = new Promise<void>((resolve) => files.onChange(resolve));

        stop();
        writeFileSync(
            join(dir, "dark.json"),
            readFileSync(join(dir, "dark.json"), "utf8").replace("50}", "100}"),
        );
        change(join(dir, "dark.json"));
        await told;

        expect(listener).not.toHaveBeenCalled();
    });

    it("saves edits to the files it reads", async () => {
        const { dir, files } = await demo();
        const message = files.message();
        const session = createSession(readFromMemory(message, readOptions(message.config)));
        session.do(
            setValue(session.tokens, "color.brand.500", {
                colorSpace: "oklch",
                components: [0.9, 0.05, 258],
            }),
        );

        const saved = await files.save(session.unsaved);

        expect(saved).toEqual({ written: ["color.json"], deleted: [] });
        expect(readFileSync(join(dir, "color.json"), "utf8")).toContain("0.9");
    });
});
