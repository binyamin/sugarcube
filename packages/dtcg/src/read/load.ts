import type { Diagnostic, Resolver } from "../index.js";
import type { Modifier } from "./input.js";
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
import { resolverPart } from "./resolver-part.js";
import { Problems } from "./diagnostics.js";
import { entriesOf, expandSources, filesNamedBy, openSources } from "./sources.js";
import { sameResolver } from "./same-object.js";

export interface Loaded {
    files: string[];
    texts: Record<string, string>;
    entry: string;
    resolver?: Resolver;
    modifiers: Modifier[];
    permutations: LoadedPermutation[];
    diagnostics: Diagnostic[];
}

export function* load(
    entry: string,
    options: PermutationOptions,
    previous: Resolver | undefined,
): Generator<Request, Loaded, Answer> {
    const used: string[] = [];
    const diagnostics = new Problems();
    const files = createFiles(used, diagnostics);
    yield* fetchFiles(files, [entry]);

    const root = parseFile(files, entry)?.root;
    const loaded = (built: Pick<Loaded, "resolver" | "modifiers" | "permutations">): Loaded => ({
        files: used,
        texts: textsOf(files.texts, used),
        entry,
        diagnostics: [...diagnostics.list],
        ...built,
    });
    if (!isResolver(entry, root)) {
        return loaded(fromTokenFiles([{ path: entry, json: openFile(files, entry, "tokens") }]));
    }

    const file = openFile(files, entry, "resolver");
    if (!file) return loaded({ modifiers: [], permutations: [] });

    const resolver = checkResolver(file, diagnostics);
    const { items, setsUsed } = expandSources(resolver, diagnostics);
    const entries = entriesOf(items);
    yield* fetchFiles(files, filesNamedBy(entries));
    const sources = openSources(files, resolver, entries);
    const made = resolverPart(resolver, setsUsed, diagnostics);
    const part = previous && sameResolver(previous, made) ? previous : made;
    return loaded({
        resolver: part,
        ...fromResolver(part, items, sources, options, diagnostics),
    });
}

function textsOf(texts: Map<string, FileText>, used: string[]): Record<string, string> {
    const kept: Record<string, string> = {};
    for (const path of used) {
        const text = texts.get(path);
        if (text && "text" in text) kept[path] = text.text;
    }
    return kept;
}
