// A token editor in the browser, with a server that owns the files. The server reads the files and
// sends them, with the file it started from. The browser reads the same design tokens from them and
// edits them. A save sends back only the edits; the server checks they are edits and writes them,
// and an edit to a file that isn't one of the token files is a conflict. If a file breaks mid-edit,
// the browser keeps the last version that read cleanly.
import { type DesignTokens, type TokensInMemory, readFromMemory } from "@sugarcube-sh/dtcg";
import { type TokensOnDisk, read } from "@sugarcube-sh/dtcg/node";
import { isEdits } from "@sugarcube-sh/dtcg-edit";
import { applyToDisk } from "@sugarcube-sh/dtcg-edit/node";

declare function sendToBrowser(sent: TokensInMemory): void;

const onDisk: TokensOnDisk = { entry: "tokens/tokens.resolver.json" };
let serving: DesignTokens | undefined;

export async function serve(): Promise<void> {
    const next = await read(onDisk.entry, onDisk.options);
    const unreadable = next.diagnostics.some(
        (d) => d.kind === "invalid-json" || d.kind === "file-not-found",
    );
    if (unreadable && serving) return;
    serving = next;
    sendToBrowser(next.toMemory());
}

export function openInBrowser(sent: TokensInMemory): DesignTokens {
    return readFromMemory(sent);
}

export async function save(sent: unknown): Promise<string> {
    if (!serving) return "Nothing to save to yet";
    if (!isEdits(sent)) return "That isn't a set of edits";
    const result = await applyToDisk(onDisk, sent.ops);
    if ("conflicts" in result) return result.conflicts.map((c) => c.reason).join("\n");
    await serve();
    return `Saved ${Object.keys(result.written).length} files`;
}
