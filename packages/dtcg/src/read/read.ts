import packageJson from "../../package.json" with { type: "json" };
import type { Document, Project, ReadOptions, ReadText } from "../index.js";
import type { Answer, FileText, Request } from "./files.js";
import { collapse } from "./diagnostics.js";
import { type Loaded, load } from "./load.js";
import { normalisePermutations } from "./normalise.js";
import { fillGenerated } from "./generate.js";
import { validateExtensions } from "./validate-extensions.js";
import type { Merged } from "./merge.js";
import { createValueReader } from "./parse-value.js";
import { resolvePermutations } from "./resolve.js";
import type { PermutationOptions } from "./permutations.js";
import { fileName, filePath, folderOf, normalise } from "./paths.js";
import { parseJson } from "./json.js";
import { isResolver } from "./resolver.js";
import { thrownMessages } from "../error-messages.js";

const { performance } = globalThis as unknown as { performance: { now(): number } };

/**
 * Reads a design system: the entry file, and every file it refers to.
 *
 * Files are fetched through `readText`, so this runs anywhere: a browser, a worker, Deno, Bun or
 * Node. `@sugarcube-sh/dtcg/node` provides a version that reads from disk.
 *
 * Never rejects because of what is, or is not, in the files. A file that cannot be fetched
 * (`readText` throws) or cannot be read is reported in {@link Document.diagnostics}, and the rest
 * is still read.
 *
 * @param entry A resolver document or a token file.
 *
 * @example
 * const doc = await read("tokens.resolver.json", {
 *   readText: (path) => fetch(path).then((r) => r.text()),
 * });
 */
export async function read(
    entry: string,
    options: ReadOptions & { readText: ReadText },
): Promise<Document> {
    return (await open(entry, options)).doc;
}

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
    const started = performance.now();
    const run = load(fileName(entry), permutationOptions(options));
    let step = run.next();
    while (!step.done) {
        step = run.next(await fetchAll(step.value, folderOf(entry), readText));
    }
    options.onStage?.("load", performance.now() - started);
    return projectOf(step.value, options);
}

async function fetchAll(files: Request, folder: string, readText: ReadText): Promise<Answer> {
    const fetched = await Promise.all(
        files.map(async (file): Promise<[string, FileText]> => {
            try {
                const text = await readText(filePath(folder, file), file);
                return [file, typeof text === "string" ? { text } : { missing: true }];
            } catch {
                return [file, { missing: true }];
            }
        }),
    );
    return Object.fromEntries(fetched);
}

/**
 * Reads a design system from text already in memory.
 *
 * The read starts from one entry, a resolver or a token file: the one given, or else the one
 * resolver among the files, or else the only file. Several token files with no resolver among
 * them are not read together, since only a resolver says which files make a design system and in
 * what order (Resolver 4.1, 6); several resolvers need an entry to say which. Either is refused
 * with a `TypeError` naming the files.
 *
 * @example
 * const doc = readFromMemory({ files: { "tokens.json": text } });
 */
export function readFromMemory(
    sources: {
        files: Record<string, string>;
        /**
         * The file to start from.
         * @default the one resolver among the files, or else the only file
         */
        entry?: string | undefined;
    },
    options: ReadOptions = {},
): Document {
    return openFromMemory(sources, options).doc;
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
        /** @default the one resolver among the files, or else the only file */
        entry?: string | undefined;
    },
    options: ReadOptions = {},
): Project {
    const started = performance.now();
    const texts = new Map(
        Object.entries(sources.files).map(([path, text]) => [normalise(path), text]),
    );
    const entry = normalise(sources.entry ?? entryAmong(texts));
    const folder = folderOf(entry);
    const run = load(fileName(entry), permutationOptions(options));

    let step = run.next();
    while (!step.done) {
        const answer: Answer = {};
        for (const path of step.value) {
            const text = texts.get(filePath(folder, path));
            answer[path] = text === undefined ? { missing: true } : { text };
        }
        step = run.next(answer);
    }
    options.onStage?.("load", performance.now() - started);
    return projectOf(step.value, options);
}

function entryAmong(texts: Map<string, string>): string {
    const names = [...texts.keys()];
    const [only] = names;
    if (names.length === 1 && only !== undefined) return only;
    const resolvers = names.filter((name) => {
        const root = parseJson(texts.get(name) ?? "").root;
        return root !== undefined && isResolver(root);
    });
    const [resolver] = resolvers;
    if (resolvers.length === 1 && resolver !== undefined) return resolver;
    if (resolvers.length > 1) throw new TypeError(thrownMessages.severalResolvers(resolvers));
    throw new TypeError(thrownMessages.noResolver(names));
}

function projectOf(loaded: Loaded, options: ReadOptions): Project {
    const doc = toDocument(loaded, options);
    const { entry, texts } = loaded;
    return { doc, entry, files: texts, options };
}

function permutationOptions({
    inputs,
    permutations = "all",
    permutationLimit = 32,
}: ReadOptions): PermutationOptions {
    return { ...(inputs && { inputs }), permutations, limit: permutationLimit };
}

function toDocument(
    loaded: Loaded,
    {
        onStage,
        generators = [],
        extensionValidators = [],
        hexStringColors,
        ignoreUnknownProperties,
    }: ReadOptions,
): Document {
    const found: Document["diagnostics"] = [];
    const parseOptions = {
        hexStringColors: hexStringColors ?? false,
        ignoreUnknownProperties: ignoreUnknownProperties ?? false,
    };
    const readValue = createValueReader(found, parseOptions);
    let generating = 0;
    const generate = (merged: Merged, permutation: number) => {
        if (generators.length === 0) return;
        const started = performance.now();
        fillGenerated(merged, generators, { permutation, parseOptions }, found);
        generating += performance.now() - started;
    };
    const normalising = performance.now();
    const normalised = normalisePermutations(loaded.permutations, readValue, found, generate);
    const resolving = performance.now();
    onStage?.("generate", generating);
    onStage?.("normalise", resolving - normalising - generating);
    const permutations = resolvePermutations(normalised, readValue, found);
    onStage?.("resolve", performance.now() - resolving);
    validateExtensions(
        normalised,
        permutations,
        { validators: extensionValidators, parseOptions },
        found,
    );

    return {
        version: packageJson.version,
        files: loaded.files,
        modifiers: loaded.modifiers,
        usedBy: loaded.usedBy,
        permutations,
        parseOptions,
        diagnostics: [...loaded.diagnostics, ...collapse(found, permutations.length)],
    };
}
