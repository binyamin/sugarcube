import { readFile } from "node:fs/promises";
import type { Project, ReadOptions } from "../index.js";
import { open as openAnywhere } from "../read/open.js";

/**
 * Opens a design system from disk: reads it as `read` from `@sugarcube-sh/dtcg/node` does, and
 * keeps the text of every file it read. Paths in the result are relative to the entry's folder:
 * join them with it to reach a file on disk.
 *
 * @example
 * const project = await open("tokens/tokens.resolver.json");
 * project.files["dark.json"];
 */
export function open(entry: string, options: ReadOptions = {}): Promise<Project> {
    return openAnywhere(entry.replaceAll("\\", "/"), {
        ...options,
        readText: (file) => readFile(file, "utf8"),
    });
}
