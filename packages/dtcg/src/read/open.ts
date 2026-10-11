import type { Project, ReadOptions, ReadText } from "../index.js";
import { fileName } from "./paths.js";
import { read, readFromMemoryKeeping } from "./read.js";

/**
 * Reads a design system as {@link read} does, and keeps the text of every file it read beside
 * the Document, for a tool that changes the files.
 *
 * @param entry A resolver document or a token file.
 *
 * @example
 * const project = await open("tokens.resolver.json", {
 *   readText: (path) => fetch(path).then((r) => r.text()),
 * });
 * project.files["dark.json"];
 */
export async function open(
    entry: string,
    { readText, ...options }: ReadOptions & { readText: ReadText },
): Promise<Project> {
    const texts = new Map<string, string>();
    const doc = await read(entry, {
        ...options,
        readText: async (path, file) => {
            const text = await readText(path, file);
            texts.set(file, text);
            return text;
        },
    });
    const files: Record<string, string> = {};
    for (const file of doc.files) {
        const text = texts.get(file);
        if (text !== undefined) files[file] = text;
    }
    return { doc, entry: fileName(entry), files, options };
}

/**
 * Reads a design system from text already in memory, as {@link readFromMemory} does, and keeps
 * the text of every file it read beside the Document. Files it did not read are left out.
 *
 * @example
 * const project = openFromMemory({ files, entry: "tokens.resolver.json" });
 * const again = openFromMemory(project, project.options); // the same Document
 */
export function openFromMemory(
    sources: {
        files: Record<string, string>;
        /** @default the first resolver among the files, or else every file, in order */
        entry?: string;
    },
    options: ReadOptions = {},
): Project {
    const files: Record<string, string> = {};
    const doc = readFromMemoryKeeping(sources, options, (file, text) => {
        files[file] = text;
    });
    const { entry } = sources;
    return { doc, ...(entry !== undefined && { entry: fileName(entry) }), files, options };
}
