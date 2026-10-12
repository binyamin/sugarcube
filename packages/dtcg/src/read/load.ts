import type { Diagnostic, Input } from "../index.js";
import {
    type Answer,
    type FileText,
    type Request,
    createFiles,
    fetchFiles,
    openFile,
    parseFile,
} from "./files.js";
import {
    type PermutationOptions,
    type LoadedPermutation,
    fromResolver,
    fromTokenFiles,
} from "./permutations.js";
import { checkResolver, isResolver } from "./resolver.js";
import { entriesOf, expandSources, filesNamedBy, openSources } from "./sources.js";

export interface Loaded {
    files: string[];
    texts: Record<string, string>;
    entry: string;
    modifiers: Record<string, { contexts: string[]; default?: string }>;
    usedBy: Record<string, "everyone" | Input[]>;
    permutations: LoadedPermutation[];
    diagnostics: Diagnostic[];
}

export function* load(
    entry: string,
    options: PermutationOptions,
): Generator<Request, Loaded, Answer> {
    const used: string[] = [];
    const diagnostics: Diagnostic[] = [];
    const files = createFiles(used, diagnostics);
    yield* fetchFiles(files, [entry]);

    const root = parseFile(files, entry)?.root;
    const loaded = (built: Pick<Loaded, "modifiers" | "usedBy" | "permutations">): Loaded => ({
        files: used,
        texts: textsOf(files.texts, used),
        entry,
        diagnostics,
        ...built,
    });
    if (root === undefined || !isResolver(root)) {
        return loaded(fromTokenFiles([{ path: entry, json: openFile(files, entry, "tokens") }]));
    }

    const file = openFile(files, entry, "resolver");
    if (!file) return loaded({ modifiers: {}, usedBy: {}, permutations: [] });

    const resolver = checkResolver(file, diagnostics);
    const items = expandSources(resolver, diagnostics);
    const entries = entriesOf(items);
    yield* fetchFiles(files, filesNamedBy(resolver, entries));
    const sources = openSources(files, resolver, entries);
    return loaded(fromResolver(resolver, items, sources, options, diagnostics));
}

function textsOf(texts: Map<string, FileText>, used: string[]): Record<string, string> {
    const kept: Record<string, string> = {};
    for (const path of used) {
        const text = texts.get(path);
        if (text && "text" in text) kept[path] = text.text;
    }
    return kept;
}
