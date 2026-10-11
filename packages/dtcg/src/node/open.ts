import { readFile } from "node:fs/promises";
import type { Project, ReadOptions } from "../index.js";
import { open as openAnywhere } from "../read/read.js";
import { slashed } from "./paths.js";

/**
 * Reads a design system from disk and keeps the text of every file it read beside the Document.
 * Paths in the result are relative to the entry's folder: join them with it to reach a file on
 * disk.
 *
 * @example
 * const project = await open("tokens/tokens.resolver.json");
 * project.files["dark.json"];
 */
export function open(entry: string, options: ReadOptions = {}): Promise<Project> {
    return openAnywhere(slashed(entry), {
        ...options,
        readText: (file) => readFile(file, "utf8"),
    });
}
