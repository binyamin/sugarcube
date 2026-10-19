import { rename, setValue } from "@sugarcube-sh/dtcg-edit";
import { describe, expect, it } from "vitest";
import { decodeEdits, encodeEdits } from "../../src/controllers/edits-text";
import { keepUnsaved } from "../../src/controllers/unsaved";
import { demoMessage, studioOn, withFile } from "./demo-message";

const darkText = { input: { mode: "dark" } } as const;

function memoryStorage() {
    const held = new Map<string, string>();
    return {
        held,
        getItem: (key: string) => held.get(key) ?? null,
        setItem: (key: string, value: string) => void held.set(key, value),
        removeItem: (key: string) => void held.delete(key),
    };
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 20));

describe("edits as text", () => {
    it("gives back the same edits", async () => {
        const studio = studioOn();
        studio.do(rename(studio.state.tokens, "color.text.default", "body"));

        expect(await decodeEdits(await encodeEdits(studio.unsaved))).toEqual(studio.unsaved);
    });

    it("gives nothing for text that isn't edits", async () => {
        expect(await decodeEdits("not even close")).toBeUndefined();
        expect(await decodeEdits(await encodeText('{ "ops": "no" }'))).toBeUndefined();
    });
});

describe("keepUnsaved", () => {
    it("puts unsaved edits back when studio opens again, as after a reload", async () => {
        const storage = memoryStorage();
        const before = studioOn();
        keepUnsaved(before, storage, "demo");
        before.do(
            setValue(before.state.tokens, "color.text.default", "{color.neutral.100}", darkText),
        );
        await settled();

        const after = studioOn();
        await keepUnsaved(after, storage, "demo");

        expect(after.state.changes.map(({ path }) => path)).toEqual(["color.text.default"]);
        expect(after.state.clashes).toEqual([]);
    });

    it("keeps nothing once the edits are saved or discarded", async () => {
        const storage = memoryStorage();
        const studio = studioOn();
        keepUnsaved(studio, storage, "demo");
        studio.do(
            setValue(studio.state.tokens, "color.text.default", "{color.neutral.100}", darkText),
        );
        await settled();
        expect(storage.held.has("demo")).toBe(true);

        studio.discard();
        await settled();

        expect(storage.held.has("demo")).toBe(false);
    });

    it("gives a clash for an edit the files no longer fit, keeping the rest", async () => {
        const storage = memoryStorage();
        const before = studioOn();
        keepUnsaved(before, storage, "demo");
        before.do(
            setValue(before.state.tokens, "color.text.default", "{color.neutral.100}", darkText),
        );
        before.do(setValue(before.state.tokens, "radius.md", { value: 0.5, unit: "rem" }));
        await settled();

        const dark = demoMessage().files["dark.json"] ?? "";
        const after = studioOn(
            withFile("dark.json", dark.replace("{color.neutral.50}", "{color.neutral.200}")),
        );
        await keepUnsaved(after, storage, "demo");

        expect(after.state.changes.map(({ path }) => path)).toEqual(["radius.md"]);
        expect(after.state.clashes.map(({ path, yours, theirs }) => [path, yours, theirs])).toEqual(
            [
                [
                    "color.text.default",
                    { $value: "{color.neutral.100}" },
                    { $value: "{color.neutral.200}" },
                ],
            ],
        );
    });

    it("keeps each project's edits apart", async () => {
        const storage = memoryStorage();
        const studio = studioOn();
        keepUnsaved(studio, storage, "one");
        studio.do(setValue(studio.state.tokens, "radius.md", { value: 0.5, unit: "rem" }));
        await settled();

        const other = studioOn();
        await keepUnsaved(other, storage, "two");

        expect(other.state.changes).toEqual([]);
    });
});

async function encodeText(text: string): Promise<string> {
    const bytes = new TextEncoder().encode(text);
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
    const zipped = new Uint8Array(await new Response(stream).arrayBuffer());
    let binary = "";
    for (const byte of zipped) binary += String.fromCharCode(byte);
    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/={1,2}$/, "");
}
