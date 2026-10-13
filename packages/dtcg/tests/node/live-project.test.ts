import { EventEmitter } from "node:events";
import { mkdtemp, realpath, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Project } from "../../src/index.js";
import { type ProjectSource, type ReadEvent, liveProject } from "../../src/node.js";

const afterRead = vi.hoisted(() => ({ once: undefined as (() => Promise<void>) | undefined }));

vi.mock("../../src/node/open.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../src/node/open.js")>();
    return {
        ...actual,
        open: async (...args: Parameters<typeof actual.open>) => {
            const opened = await actual.open(...args);
            const then = afterRead.once;
            afterRead.once = undefined;
            await then?.();
            return opened;
        },
    };
});

const color = (hex: string) => ({ $type: "color", $value: hex });

let folder: string;
const outside: string[] = [];

afterEach(async () => {
    for (const each of [folder, ...outside.splice(0)]) {
        await rm(each, { recursive: true, force: true });
    }
});

async function project(): Promise<string> {
    folder = await realpath(await mkdtemp(join(tmpdir(), "dtcg-live-")));
    await tokens("base.json", { color: { ink: color("#111111") } });
    await tokens("more.json", { color: { paper: color("#eeeeee") } });
    await resolver(["base.json"]);
    return join(folder, "tokens.resolver.json");
}

function tokens(file: string, json: unknown) {
    return writeFile(join(folder, file), JSON.stringify(json));
}

function resolver(files: string[]) {
    return writeFile(
        join(folder, "tokens.resolver.json"),
        JSON.stringify({
            version: "2025.10",
            resolutionOrder: [
                { type: "set", name: "base", sources: files.map((file) => ({ $ref: file })) },
            ],
        }),
    );
}

const disk = (file: string) => join(folder, file).replaceAll("\\", "/");

function standIn() {
    const added: string[] = [];
    const watcher = Object.assign(new EventEmitter(), {
        add(paths: string | readonly string[]) {
            added.push(...(typeof paths === "string" ? [paths] : paths));
        },
    });
    const save = (file: string) => watcher.emit("change", disk(file));
    return { watcher, added, save };
}

function live(source: ProjectSource | (() => ProjectSource), whenReading?: (read: number) => void) {
    const errors: unknown[] = [];
    let started = 0;
    const asked = () => {
        whenReading?.(started++);
        return typeof source === "function" ? source() : source;
    };
    const current = liveProject(asked, { onError: (error) => errors.push(error) });
    const reads: Array<{ project: Project; event: ReadEvent }> = [];
    current.onRead((read, event) => reads.push({ project: read, event }));
    const { watcher, added, save } = standIn();
    current.watch(watcher);
    return { live: current, errors, reads, watcher, added, save };
}

const hexOf = (opened: Project) => JSON.stringify(opened.doc.permutation().token("color.ink"));

describe("a project kept current with its files", () => {
    it("reads at once, and reads again when a file it lists is saved", async () => {
        const entry = await project();
        const { live: current, reads, save } = live({ entry, options: { hexStringColors: true } });
        const first = await current.project();
        expect(first.doc.files).toStrictEqual(["tokens.resolver.json", "base.json"]);

        await tokens("base.json", { color: { ink: color("#222222") } });
        save("base.json");
        const next = await current.project();

        expect(hexOf(next)).toContain("#222222");
        expect(reads.map(({ project: read }) => read)).toStrictEqual([next]);
    });

    it("keeps the text of each file it read with the design system", async () => {
        const entry = await project();
        const { live: current } = live({ entry });
        const first = await current.project();

        expect(Object.keys(first.files)).toStrictEqual(first.doc.files);
        expect(first.files["base.json"]).toBe(JSON.stringify({ color: { ink: color("#111111") } }));
    });

    it("holds the text a save wrote, with the design system read from it", async () => {
        const entry = await project();
        const { live: current, save } = live({ entry });
        await current.project();

        await tokens("base.json", { color: { ink: color("#222222") } });
        save("base.json");
        const next = await current.project();

        expect(hexOf(next)).toContain("#222222");
        expect(next.files["base.json"]).toBe(JSON.stringify({ color: { ink: color("#222222") } }));
    });

    it("reads again when a file it lists is added or deleted", async () => {
        const entry = await project();
        const { live: current, reads, watcher } = live({ entry });
        await current.project();

        watcher.emit("unlink", disk("base.json"));
        await current.project();
        watcher.emit("add", disk("base.json"));
        await current.project();

        expect(reads.map(({ event }) => event.file)).toStrictEqual(["base.json", "base.json"]);
    });

    it("collapses saves during a read into exactly one more read, the one listeners hear", async () => {
        const entry = await project();
        const {
            live: current,
            reads,
            save,
        } = live({ entry }, (read) => {
            if (read !== 1) return;
            save("base.json");
            save("tokens.resolver.json");
            save("base.json");
        });
        await current.project();

        save("base.json");
        await vi.waitFor(() => expect(reads).toHaveLength(1));
        await current.project();

        expect(reads).toHaveLength(1);
        expect(reads.map(({ event }) => event.file)).toStrictEqual(["base.json"]);
    });

    it("tells listeners of a read only when no read waiting to start has replaced it", async () => {
        const entry = await project();
        let hexStringColors = false;
        const {
            live: current,
            reads,
            save,
        } = live(
            () => ({ entry, options: { hexStringColors } }),
            (read) => {
                if (read !== 1) return;
                hexStringColors = true;
                void current.reread();
            },
        );
        await current.project();

        save("base.json");
        await vi.waitFor(() => expect(reads).toHaveLength(1));
        await current.project();

        expect(reads).toHaveLength(1);
        expect(reads[0]?.project.doc.diagnostics).toStrictEqual([]);
        expect(reads[0]?.event.file).toBeUndefined();
    });

    it("waits for a read waiting to start before answering with the project", async () => {
        const entry = await project();
        let answer: Promise<Project> | undefined;
        const {
            live: current,
            reads,
            save,
        } = live({ entry }, (read) => {
            if (read !== 1) return;
            save("base.json");
            answer = current.project();
        });
        await current.project();

        save("base.json");
        await vi.waitFor(() => expect(answer).toBeDefined());

        expect(await answer).toBe(reads[0]?.project);
        expect(reads).toHaveLength(1);
    });

    it("reads again when a read caught a file half-saved and the watcher never says", async () => {
        const entry = await project();
        const { live: current, reads, watcher } = live({ entry });
        await current.project();

        const path = join(folder, "base.json");
        await writeFile(path, "");
        const looked = await stat(path);
        afterRead.once = async () => {
            await tokens("base.json", { color: { ink: color("#222222") } });
            await utimes(path, looked.atime, looked.mtime);
        };
        watcher.emit("change", disk("base.json"), looked);

        await vi.waitFor(() => expect(hexOf(reads.at(-1)?.project as Project)).toContain("222222"));
        const last = await current.project();
        expect(hexOf(last)).toContain("222222");
        expect(last.doc.diagnostics.map(({ kind }) => kind)).not.toContain("invalid-json");
        expect(hexOf(reads.at(-1)?.project as Project)).toContain("222222");
    });

    it("reads a file that is broken, and left so, only once", async () => {
        const entry = await project();
        const { live: current, reads, save } = live({ entry });
        await current.project();

        await writeFile(join(folder, "base.json"), "{");
        save("base.json");

        await vi.waitFor(() => expect(reads).toHaveLength(1));
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(reads).toHaveLength(1);
        expect(reads[0]?.project.doc.diagnostics.map(({ kind }) => kind)).toContain("invalid-json");
    });

    it("reads again when a file a read gains was saved during that read", async () => {
        const entry = await project();
        const {
            live: current,
            reads,
            save,
        } = live({ entry }, (read) => {
            if (read === 1) save("more.json");
        });
        await current.project();

        await resolver(["base.json", "more.json"]);
        save("tokens.resolver.json");

        await vi.waitFor(() => expect(reads).toHaveLength(1));
        await current.project();
        expect(reads.map(({ event }) => event.file)).toStrictEqual(["more.json"]);
        expect(reads[0]?.project.doc.files).toContain("more.json");
    });

    it("does not read again for a file the design system never listed", async () => {
        const entry = await project();
        const { live: current, reads, save } = live({ entry });
        const first = await current.project();

        save("more.json");
        save("notes.json");

        expect(await current.project()).toBe(first);
        expect(reads).toHaveLength(0);
    });

    it("does not read again for a file the design system no longer lists", async () => {
        const entry = await project();
        await resolver(["base.json", "more.json"]);
        const { live: current, reads, save } = live({ entry });
        await current.project();

        await resolver(["base.json"]);
        save("tokens.resolver.json");
        const latest = await current.project();
        save("more.json");

        expect(await current.project()).toBe(latest);
        expect(reads).toHaveLength(1);
    });

    it("names the saved file as the design system does, and times the read", async () => {
        const entry = await project();
        const { live: current, reads, save } = live({ entry });
        await current.project();

        save("base.json");
        await current.project();
        await current.reread();

        expect(reads.map(({ event }) => Object.keys(event).sort())).toStrictEqual([
            ["file", "ms"],
            ["ms"],
        ]);
        expect(reads[0]?.event.file).toBe("base.json");
        expect(reads[0]?.event.ms).toBeGreaterThan(0);
        expect(reads[1]?.event.ms).toBeGreaterThan(0);
    });

    it("matches a path the watcher gives with backslashes", async () => {
        const entry = await project();
        const { live: current, reads, watcher } = live({ entry });
        await current.project();

        watcher.emit("change", disk("base.json").replaceAll("/", "\\"));
        await current.project();

        expect(reads.map(({ event }) => event.file)).toStrictEqual(["base.json"]);
    });

    it("matches a path the watcher gives relative to the working directory", async () => {
        const entry = await project();
        const { live: current, reads, watcher } = live({ entry });
        await current.project();

        watcher.emit("change", relative(process.cwd(), join(folder, "base.json")));
        await current.project();

        expect(reads.map(({ event }) => event.file)).toStrictEqual(["base.json"]);
    });

    it("watches and matches a file named from the root", async () => {
        const entry = await project();
        const elsewhere = await realpath(await mkdtemp(join(tmpdir(), "dtcg-live-outside-")));
        outside.push(elsewhere);
        const brand = join(elsewhere, "brand.json").replaceAll("\\", "/");
        await writeFile(brand, JSON.stringify({ brand: color("#333333") }));
        await resolver(["base.json", brand]);
        const { live: current, reads, watcher, added } = live({ entry });
        await current.project();

        watcher.emit("change", brand);
        await current.project();

        expect(added).toContain(brand);
        expect(reads.map(({ event }) => event.file)).toStrictEqual([brand]);
    });

    it("watches a file named relative to a folder above the entry's", async () => {
        const entry = await project();
        const elsewhere = await realpath(await mkdtemp(join(tmpdir(), "dtcg-live-outside-")));
        outside.push(elsewhere);
        const brand = join(elsewhere, "brand.json");
        await writeFile(brand, JSON.stringify({ brand: color("#333333") }));
        const name = relative(folder, brand).replaceAll("\\", "/");
        await resolver(["base.json", name]);
        const { live: current, reads, watcher, added } = live({ entry });
        await current.project();

        watcher.emit("change", brand.replaceAll("\\", "/"));
        await current.project();

        expect(added).toContain(brand.replaceAll("\\", "/"));
        expect(reads.map(({ event }) => event.file)).toStrictEqual([name]);
    });

    it("adds the files it lists to the watcher at once, then each file a later read gains", async () => {
        const entry = await project();
        const { live: current, added, save } = live({ entry });
        await current.project();
        const now = [...added];

        await resolver(["base.json", "more.json"]);
        save("tokens.resolver.json");
        await current.project();

        expect(now.sort()).toStrictEqual([disk("base.json"), disk("tokens.resolver.json")]);
        expect(added.slice(now.length)).toStrictEqual([disk("more.json")]);
    });

    it("adds its files to a watcher given before the first read ends", async () => {
        const entry = await project();
        const current = liveProject({ entry }, { onError: () => {} });
        const { watcher, added } = standIn();
        current.watch(watcher);
        await current.project();

        expect(added.sort()).toStrictEqual([disk("base.json"), disk("tokens.resolver.json")]);
    });

    it("reads an entry given relative to the working directory", async () => {
        const entry = relative(process.cwd(), await project());
        const { live: current, reads, save, added } = live({ entry });
        await current.project();

        save("base.json");
        await current.project();

        expect(added).toContain(disk("base.json"));
        expect(reads).toHaveLength(1);
    });

    it("asks the source again when told to read again", async () => {
        const entry = await project();
        let hexStringColors = false;
        let asked = 0;
        const { live: current, reads } = live(() => {
            asked += 1;
            return { entry, options: { hexStringColors } };
        });
        expect((await current.project()).doc.diagnostics.map(({ kind }) => kind)).toContain(
            "hex-string-color",
        );

        hexStringColors = true;
        await expect(current.reread()).resolves.toBeUndefined();
        const next = await current.project();

        expect(asked).toBe(2);
        expect(next.doc.diagnostics).toStrictEqual([]);
        expect(reads.map(({ project: read }) => read)).toStrictEqual([next]);
    });

    it("stops calling a listener once it unsubscribes", async () => {
        const entry = await project();
        const { live: current, save } = live({ entry });
        await current.project();
        const seen: Project[] = [];
        const stop = current.onRead((read) => seen.push(read));

        save("base.json");
        await current.project();
        stop();
        save("base.json");
        await current.project();

        expect(seen).toHaveLength(1);
    });

    it("gives what a listener throws to onError, and still calls the others", async () => {
        const entry = await project();
        const { live: current, errors, reads, save } = live({ entry });
        await current.project();
        const broke = new Error("the listener broke");
        current.onRead(() => {
            throw broke;
        });
        const seen: Project[] = [];
        current.onRead((read) => seen.push(read));

        save("base.json");
        await current.project();

        expect(errors).toStrictEqual([broke]);
        expect(reads).toHaveLength(1);
        expect(seen).toHaveLength(1);
    });

    it("gives a read that rejects to onError, with no unhandled rejection", async () => {
        const entry = await project();
        const unhandled: unknown[] = [];
        const onUnhandled = (reason: unknown) => unhandled.push(reason);
        process.on("unhandledRejection", onUnhandled);
        try {
            const failure = new Error("no source");
            let fail = false;
            const {
                live: current,
                errors,
                reads,
                save,
            } = live(() => {
                if (fail) throw failure;
                return { entry };
            });
            await current.project();

            fail = true;
            save("base.json");
            await expect(current.project()).rejects.toBe(failure);
            await new Promise((settled) => setTimeout(settled, 10));

            expect(errors).toStrictEqual([failure]);
            expect(reads).toHaveLength(0);
            expect(unhandled).toStrictEqual([]);

            await expect(current.reread()).resolves.toBeUndefined();
            await new Promise((settled) => setTimeout(settled, 10));
            expect(errors).toStrictEqual([failure, failure]);
            expect(unhandled).toStrictEqual([]);

            fail = false;
            save("base.json");
            await current.project();
            expect(reads).toHaveLength(1);
        } finally {
            process.off("unhandledRejection", onUnhandled);
        }
    });

    it("gives a first read that rejects to onError, with no unhandled rejection", async () => {
        const unhandled: unknown[] = [];
        const onUnhandled = (reason: unknown) => unhandled.push(reason);
        process.on("unhandledRejection", onUnhandled);
        try {
            const failure = new Error("no source");
            const errors: unknown[] = [];
            liveProject(
                () => {
                    throw failure;
                },
                { onError: (error) => errors.push(error) },
            );
            await new Promise((settled) => setTimeout(settled, 10));

            expect(errors).toStrictEqual([failure]);
            expect(unhandled).toStrictEqual([]);
        } finally {
            process.off("unhandledRejection", onUnhandled);
        }
    });
});
