import { readFromMemory } from "@sugarcube-sh/dtcg";
import { type Edits, createSession, setValue } from "@sugarcube-sh/dtcg-edit";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import type { Env } from "../src/env";

const REPO = "owner/demo";
const BASE_SHA = "base000";
const ENTRY = "tokens/tokens.resolver.json";

const RESOLVER = `{
  "version": "2025.10",
  "resolutionOrder": [
    { "type": "set", "name": "base", "sources": [{ "$ref": "color.json" }] },
    {
      "type": "modifier",
      "name": "mode",
      "default": "light",
      "contexts": { "light": [], "dark": [{ "$ref": "dark.json" }] }
    }
  ]
}
`;
const COLOR = `{
  "color": {
    "$type": "color",
    "neutral": {
      "50": { "$value": "#fafafa" },
      "100": { "$value": "#f5f5f5" },
      "200": { "$value": "#e5e5e5" },
      "900": { "$value": "#171717", "$description": "Café noir" }
    },
    "text": { "default": { "$value": "{color.neutral.900}" } }
  }
}
`;
const DARK = `{
  "color": {
    "text": { "default": { "$value": "{color.neutral.50}" } }
  }
}
`;
const BUILT = { "tokens.resolver.json": RESOLVER, "color.json": COLOR, "dark.json": DARK };

let env: Env;

beforeAll(async () => {
    const pair = await crypto.subtle.generateKey(
        {
            name: "RSASSA-PKCS1-v1_5",
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: "SHA-256",
        },
        true,
        ["sign", "verify"],
    );
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
    const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...pkcs8))}\n-----END PRIVATE KEY-----`;
    env = {
        GITHUB_CLIENT_ID: "client",
        GITHUB_INSTALLATION_ID: "1",
        GITHUB_APP_PRIVATE_KEY: pem,
        GITHUB_REPO: REPO,
        GITHUB_BASE_BRANCH: "main",
    };
});

let unexpected: string[] = [];

beforeEach(() => {
    unexpected = [];
});

afterEach(() => {
    vi.unstubAllGlobals();
    expect(unexpected).toEqual([]);
});

function github(files: Record<string, string>) {
    const posted: Array<{ path: string; body: unknown }> = [];
    const reads: Array<{ path: string; accept: string | null }> = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
        const path = url.replace("https://api.github.com", "");
        if (init?.method === "POST")
            posted.push({ path, body: JSON.parse(String(init.body ?? "{}")) });
        const reply = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
        if (path.endsWith("/access_tokens")) return reply({ token: "t" });
        if (path.endsWith("/git/ref/heads/main")) return reply({ object: { sha: BASE_SHA } });
        if (path.includes("/git/commits/")) return reply({ tree: { sha: "tree000" } });
        if (path.includes("/contents/")) {
            reads.push({ path, accept: new Headers(init?.headers).get("Accept") });
            const file = decodeURIComponent(path.split("/contents/")[1]?.split("?")[0] ?? "");
            const text = files[file];
            return text === undefined
                ? new Response("Not Found", { status: 404 })
                : new Response(text, { status: 200 });
        }
        if (path.endsWith("/git/trees")) return reply({ sha: "tree111" });
        if (path.endsWith("/git/commits")) return reply({ sha: "commit111" });
        if (path.endsWith("/git/refs")) return reply({});
        if (path.endsWith("/pulls"))
            return reply({ number: 7, html_url: "https://github.com/owner/demo/pull/7" });
        unexpected.push(path);
        return new Response("not stubbed", { status: 500 });
    });
    return { posted, reads };
}

const onGitHub = (files: Record<string, string>) =>
    github(
        Object.fromEntries(Object.entries(files).map(([file, text]) => [`tokens/${file}`, text])),
    );

const submit = (body: unknown) =>
    worker.fetch(
        new Request("https://worker.test/submit-pr", {
            method: "POST",
            body: JSON.stringify(body),
        }),
        env,
    );

function darkTextTo(value: string): Edits {
    const session = createSession(readFromMemory({ files: BUILT, entry: "tokens.resolver.json" }));
    session.do(setValue(session.tokens, "color.text.default", value, { input: { mode: "dark" } }));
    return session.unsaved;
}

const save = (edits: unknown) => ({
    title: "color.text.default changed (mode: dark)",
    description: "- `color.text.default` changed (mode: dark)",
    entry: ENTRY,
    edits,
});

function treeOf(posted: Array<{ path: string; body: unknown }>) {
    const sent = posted.find((post) => post.path.endsWith("/git/trees"));
    if (!sent) throw new Error("no tree was posted");
    return (sent.body as { tree: Array<{ path: string; content?: string; sha?: null }> }).tree;
}

describe("the door", () => {
    it("refuses edits that aren't a session's edits", async () => {
        const response = await submit(
            save({ ops: [{ kind: "set", file: "dark.json", jsonPath: [], value: 1, was: 0 }] }),
        );
        expect(response.status).toBe(400);
    });

    it("refuses a save with nothing in it", async () => {
        expect((await submit(save({ steps: [] }))).status).toBe(400);
    });

    it("refuses a save with no title or no entry", async () => {
        const edits = darkTextTo("{color.neutral.100}");
        expect((await submit({ ...save(edits), title: "" })).status).toBe(400);
        expect((await submit({ ...save(edits), entry: undefined })).status).toBe(400);
    });
});

describe("a save", () => {
    it("reads every file at the commit it builds on, as raw text", async () => {
        const gh = onGitHub(BUILT);

        await submit(save(darkTextTo("{color.neutral.100}")));

        expect(gh.reads.map((read) => read.path).sort()).toEqual(
            ["color.json", "dark.json", "tokens.resolver.json"].map(
                (file) => `/repos/${REPO}/contents/tokens/${file}?ref=${BASE_SHA}`,
            ),
        );
        expect(gh.reads.every((read) => read.accept === "application/vnd.github.raw+json")).toBe(
            true,
        );
    });

    it("commits only the file the edit changes, at its path in the repository, on the commit it read", async () => {
        const gh = onGitHub(BUILT);

        const response = await submit(save(darkTextTo("{color.neutral.100}")));

        expect(response.status).toBe(201);
        const tree = treeOf(gh.posted);
        expect(tree.map((entry) => entry.path)).toEqual(["tokens/dark.json"]);
        expect(JSON.parse(tree[0]?.content ?? "{}").color.text.default.$value).toBe(
            "{color.neutral.100}",
        );
        const commit = gh.posted.find((post) => post.path.endsWith("/git/commits"))?.body as {
            parents: string[];
        };
        expect(commit.parents).toEqual([BASE_SHA]);
    });

    it("keeps a change made on GitHub elsewhere in the same file", async () => {
        const theirs = DARK.replace(
            `"text": {`,
            `"bg": { "$value": "{color.neutral.900}" },\n    "text": {`,
        );
        const gh = onGitHub({ ...BUILT, "dark.json": theirs });

        expect((await submit(save(darkTextTo("{color.neutral.100}")))).status).toBe(201);
        const written = JSON.parse(treeOf(gh.posted)[0]?.content ?? "{}");
        expect(written.color.bg.$value).toBe("{color.neutral.900}");
        expect(written.color.text.default.$value).toBe("{color.neutral.100}");
    });

    it("answers with the pull request and the files as it read them", async () => {
        onGitHub(BUILT);

        const response = await submit(save(darkTextTo("{color.neutral.100}")));

        expect(await response.json()).toEqual({
            pullRequest: { number: 7, url: "https://github.com/owner/demo/pull/7" },
            files: BUILT,
        });
    });

    it("names the branch by its commit, so two saves in one second don't take the same name", async () => {
        const gh = onGitHub(BUILT);

        await submit(save(darkTextTo("{color.neutral.100}")));

        const ref = gh.posted.find((post) => post.path.endsWith("/git/refs"))?.body as {
            ref: string;
        };
        expect(ref.ref).toMatch(/^refs\/heads\/studio-\d{14}-commit1$/);
    });

    it("deletes a file an edit deletes", async () => {
        const gh = onGitHub(BUILT);
        const edits: Edits = {
            steps: [
                {
                    ops: [
                        {
                            kind: "set",
                            file: "tokens.resolver.json",
                            jsonPath: ["resolutionOrder", 1, "contexts", "dark"],
                            value: [],
                            was: [{ $ref: "dark.json" }],
                        },
                        { kind: "deleteFile", file: "dark.json", was: DARK },
                    ],
                    moved: [],
                },
            ],
        };

        expect((await submit(save(edits))).status).toBe(201);
        expect(treeOf(gh.posted).find((entry) => entry.path === "tokens/dark.json")).toEqual({
            path: "tokens/dark.json",
            mode: "100644",
            type: "blob",
            sha: null,
        });
    });
});

describe("an entry the repository doesn't have", () => {
    it("is refused, naming it, and opens nothing", async () => {
        const gh = onGitHub({ "color.json": COLOR, "dark.json": DARK });

        const response = await submit(save(darkTextTo("{color.neutral.100}")));

        expect(response.status).toBe(422);
        expect(((await response.json()) as { error: string }).error).toContain(ENTRY);
        expect(gh.posted.map((post) => post.path)).toEqual(["/app/installations/1/access_tokens"]);
    });
});

describe("a change on GitHub since the build", () => {
    it("is a conflict, with the files as they are now, and opens nothing", async () => {
        const theirs = DARK.replace("{color.neutral.50}", "{color.neutral.200}");
        const gh = onGitHub({ ...BUILT, "dark.json": theirs });

        const response = await submit(save(darkTextTo("{color.neutral.100}")));

        expect(response.status).toBe(409);
        const body = (await response.json()) as {
            conflicts: Array<{ kind: string; op: { file: string } }>;
            files: Record<string, string>;
        };
        expect(body.conflicts.map((conflict) => [conflict.kind, conflict.op.file])).toEqual([
            ["changed", "dark.json"],
        ]);
        expect(body.files).toEqual({ ...BUILT, "dark.json": theirs });
        expect(gh.posted.map((post) => post.path)).toEqual(["/app/installations/1/access_tokens"]);
    });
});
