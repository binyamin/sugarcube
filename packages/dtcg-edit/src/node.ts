import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { type Project, type ReadOptions, filePath } from "@sugarcube-sh/dtcg";
import { open } from "@sugarcube-sh/dtcg/node";
import { applyKeepingTexts } from "./apply.js";
import type { Conflict, FileOp } from "./index.js";

/**
 * Applies edits to the files on disk, starting from the resolver or token file at `entry`, read
 * with `options` as it was opened. Each file is read as it is now, so changes made there in the
 * meantime are kept; an edit that no longer applies, as {@link apply} decides, is returned as a
 * conflict, and so is an edit to a file the design system doesn't read, such as `package.json`,
 * or a new file nothing reads.
 *
 * Every edit is applied in memory before any file is written, so if one fails, nothing is
 * written. Each file is written to a temporary copy and then renamed into place, so no file is
 * left half-written. Gives back the project as read from the files written, with the files
 * written and deleted.
 *
 * @example
 * const saved = await applyToDisk("tokens/tokens.resolver.json", session.unsaved.ops, options);
 * if ("project" in saved) {
 *     session.saved();
 *     session.adopt(saved.project);
 * }
 */
export async function applyToDisk(
    entry: string,
    ops: FileOp[],
    options: ReadOptions = {},
): Promise<{ project: Project; written: string[]; deleted: string[] } | { conflicts: Conflict[] }> {
    const fresh = await open(entry, options);
    const done = applyKeepingTexts(fresh, ops);
    if ("conflicts" in done) return done;

    const { files } = done;
    const folder = dirname(entry);
    const changed = Object.entries(files).filter(([file, text]) => text !== fresh.files[file]);
    const written = changed.map(([file]) => file).sort();
    const deleted = Object.keys(fresh.files)
        .filter((file) => files[file] === undefined)
        .sort();
    await replaced(changed.map(([file, text]) => [filePath(folder, file), text]));
    await Promise.all(deleted.map((file) => rm(filePath(folder, file), { force: true })));
    return { project: done.project, written, deleted };
}

async function replaced(texts: [path: string, text: string][]): Promise<void> {
    const copies = texts.map(([path, text]) => ({
        path,
        text,
        copy: `${path}.${randomUUID()}.tmp`,
    }));
    const made: string[] = [];
    try {
        for (const { path, text, copy } of copies) {
            const folder = await mkdir(dirname(path), { recursive: true });
            if (folder) made.push(folder);
            await writeFile(copy, text, "utf8");
        }
        for (const { copy, path } of copies) await rename(copy, path);
    } catch (error) {
        await Promise.allSettled(copies.map(({ copy }) => rm(copy, { force: true })));
        await Promise.allSettled(
            made.map((folder) => rm(folder, { recursive: true, force: true })),
        );
        throw error;
    }
}
