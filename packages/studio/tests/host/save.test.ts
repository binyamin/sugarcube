import type { Change } from "@sugarcube-sh/dtcg";
import { setValue } from "@sugarcube-sh/dtcg-edit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pickSave, pullRequestSave } from "../../src/host/save";
import type { SaveOutcome } from "../../src/protocol";
import { studioOn } from "../controllers/demo-message";

const TO = { url: "https://worker.test/submit-pr", entry: "tokens/tokens.resolver.json" };
const darkText = { input: { mode: "dark" } } as const;

function edited(...values: [path: string, value: string][]) {
    const studio = studioOn();
    for (const [path, value] of values)
        studio.do(setValue(studio.state.tokens, path, value, darkText));
    return { edits: studio.unsaved, changes: studio.state.changes };
}

function worker(status: number, body: unknown) {
    const sent: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
        sent.push({ url, body: JSON.parse(String(init?.body)) });
        return new Response(JSON.stringify(body), { status });
    });
    return sent;
}

afterEach(() => vi.unstubAllGlobals());

describe("a save from a published link", () => {
    it("sends the edits to the worker with the resolver's path, titled by the one change", async () => {
        const sent = worker(201, {
            pullRequest: { number: 7, url: "https://github.com/pr/7" },
            files: {},
        });
        const { edits, changes } = edited(["color.text.default", "{color.neutral.100}"]);

        await pullRequestSave(TO)(edits, changes);

        expect(sent).toEqual([
            {
                url: TO.url,
                body: {
                    title: "`color.text.default` changed (mode: dark)",
                    description: "- `color.text.default` changed (mode: dark)",
                    entry: TO.entry,
                    edits: JSON.parse(JSON.stringify(edits)),
                },
            },
        ]);
    });

    it("counts several changes in the title and lists each in the description", async () => {
        const sent = worker(201, {
            pullRequest: { number: 7, url: "https://github.com/pr/7" },
            files: {},
        });
        const { edits, changes } = edited(
            ["color.text.default", "{color.neutral.100}"],
            ["color.text.muted", "{color.neutral.300}"],
        );

        await pullRequestSave(TO)(edits, changes);

        const body = sent[0]?.body as { title: string; description: string };
        expect(body.title).toBe("2 changes from studio");
        expect(body.description.split("\n")).toHaveLength(2);
    });

    it("gives the pull request it opened and the files as the worker read them", async () => {
        const files = { "dark.json": "{}" };
        worker(201, { pullRequest: { number: 7, url: "https://github.com/pr/7" }, files });
        const { edits, changes } = edited(["color.text.default", "{color.neutral.100}"]);

        expect(await pullRequestSave(TO)(edits, changes)).toEqual({
            pullRequest: { number: 7, url: "https://github.com/pr/7" },
            files,
        });
    });

    it("gives a refusal's conflicts with the files as they are now", async () => {
        const files = { "dark.json": "{}" };
        const conflicts = [{ kind: "changed", reason: "changed", op: {} }];
        worker(409, { conflicts, files });
        const { edits, changes } = edited(["color.text.default", "{color.neutral.100}"]);

        expect(await pullRequestSave(TO)(edits, changes)).toEqual({ conflicts, files });
    });

    it("fails with the worker's own words for anything else", async () => {
        worker(422, { error: "tokens/tokens.resolver.json is not in owner/demo on main." });
        const { edits, changes } = edited(["color.text.default", "{color.neutral.100}"]);

        await expect(pullRequestSave(TO)(edits, changes)).rejects.toThrow(
            "tokens/tokens.resolver.json is not in owner/demo on main.",
        );
    });
});

describe("a save the worker never answered", () => {
    it("fails naming the status when the answer isn't the worker's, such as a gateway's page", async () => {
        vi.stubGlobal(
            "fetch",
            async () => new Response("<html>Bad gateway</html>", { status: 502 }),
        );
        const { edits, changes } = edited(["color.text.default", "{color.neutral.100}"]);

        await expect(pullRequestSave(TO)(edits, changes)).rejects.toThrow("502");
    });
});

describe("which save studio has", () => {
    const call = async (): Promise<SaveOutcome> => ({ written: [], deleted: [] });

    it("saves through the server when there is one, whatever the build says", async () => {
        const sent = worker(201, {});
        const save = pickSave({ live: true, call, saveTo: TO });

        expect(await save?.({ steps: [] }, [] as Change[])).toEqual({ written: [], deleted: [] });
        expect(sent).toEqual([]);
    });

    it("saves through the worker when there is no server and the build names one", async () => {
        const sent = worker(201, {
            pullRequest: { number: 7, url: "https://github.com/pr/7" },
            files: {},
        });
        const { edits, changes } = edited(["color.text.default", "{color.neutral.100}"]);

        await pickSave({ live: false, call, saveTo: TO })?.(edits, changes);

        expect(sent.map(({ url }) => url)).toEqual([TO.url]);
    });

    it("has no save when there is no server and the build names no worker", () => {
        expect(pickSave({ live: false, call })).toBeUndefined();
    });
});
