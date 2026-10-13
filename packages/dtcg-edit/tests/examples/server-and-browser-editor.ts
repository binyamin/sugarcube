// A token editor in the browser, with a server that owns the files. The server reads the files and
// sends their text. The browser opens the same design system from that text and edits it. A save
// sends back only the edits; the server checks they are edits and writes them, and an edit to a
// file that isn't one of the token files is a conflict. If a file breaks mid-edit, the browser keeps the last version that read cleanly.
import { readFromMemory, type DesignSystem } from "@sugarcube-sh/dtcg";
import { type ProjectSource, read } from "@sugarcube-sh/dtcg/node";
import { isEdits } from "@sugarcube-sh/dtcg-edit";
import { applyToDisk } from "@sugarcube-sh/dtcg-edit/node";

declare function sendToBrowser(entry: string, files: Readonly<Record<string, string>>): void;

const source: ProjectSource = { entry: "tokens/tokens.resolver.json" };
let serving: DesignSystem | undefined;

export async function serve(): Promise<void> {
    const next = await read(source.entry, source.options);
    const unreadable = next.diagnostics.some(
        (d) => d.kind === "invalid-json" || d.kind === "file-not-found",
    );
    if (unreadable && serving) return;
    serving = next;
    sendToBrowser(
        source.entry,
        Object.fromEntries(next.files.map((file) => [file, next.text(file) ?? ""])),
    );
}

export function openInBrowser(files: Readonly<Record<string, string>>): DesignSystem {
    return readFromMemory({ files: { ...files }, entry: "tokens.resolver.json" });
}

export async function save(sent: unknown): Promise<string> {
    if (!serving) return "Nothing to save to yet";
    if (!isEdits(sent)) return "That isn't a set of edits";
    const result = await applyToDisk(source, sent.ops);
    if ("conflicts" in result) return result.conflicts.map((c) => c.reason).join("\n");
    await serve();
    return `Saved ${result.written.length} files`;
}
