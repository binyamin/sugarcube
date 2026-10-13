import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { type ProjectSource, fileOnDisk, open } from "@sugarcube-sh/dtcg/node";
import { changedFiles } from "./apply.js";
import type { FileOp } from "./index.js";

/**
 * Applies edits to the files on disk of the design system at `source`, its resolver or token file
 * and the options it is read with, as `open` and `liveProject` take them. Each file is read as it
 * is now, so changes made there in the meantime are kept; an edit that no longer applies, as
 * {@link apply} decides, is returned as a conflict, and so is an edit to a file the design system
 * doesn't read, such as `package.json`, or a new file nothing reads.
 *
 * Every edit is applied in memory before any file is written, so if one fails, nothing is
 * written. Each file is written to a temporary copy and then renamed into place, so no file is
 * left half-written. Gives back what {@link changedFiles} gives: the project as read from the
 * files written, each file written with its new text, and the files deleted.
 *
 * @example
 * const source = { entry: "tokens/tokens.resolver.json", options };
 * const saved = await applyToDisk(source, session.unsaved.ops);
 * if ("project" in saved) {
 *     session.saved();
 *     session.adopt(saved.project);
 * }
 */
export async function applyToDisk(
    { entry, options }: ProjectSource,
    ops: FileOp[],
): Promise<ReturnType<typeof changedFiles>> {
    const changes = changedFiles(await open(entry, options), ops);
    if ("conflicts" in changes) return changes;

    const { written, deleted } = changes;
    await replaced(Object.entries(written).map(([file, text]) => [fileOnDisk(entry, file), text]));
    await Promise.all(deleted.map((file) => rm(fileOnDisk(entry, file), { force: true })));
    return changes;
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
