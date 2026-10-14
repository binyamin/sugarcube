import type { Node } from "jsonc-parser";
import type {
    Diagnostic,
    DiagnosticDetailByKind,
    Input,
    Resolver,
    ResolverContext,
    SetOnRoute,
    Source,
} from "../index.js";
import { permutationLabel } from "../lookup/permutation-label.js";
import { diagnostic } from "./diagnostics.js";
import { type JsonFile, plainObject, spanOf } from "./json.js";
import type { CheckedResolver } from "./resolver.js";
import type { Loaded } from "./load.js";
import type { ExpandedItem, LoadedSource, SourceEntry } from "./sources.js";

export interface ListedSource {
    source: Omit<Source, "extensions">;
    pieces: LoadedSource[];
}

export interface LoadedPermutation {
    input: Input;
    label: string;
    contexts: ResolverContext[];
    sources: ListedSource[];
}

type Built = Pick<Loaded, "permutations">;

export interface PermutationOptions {
    inputs?: Record<string, unknown>[];
    permutations: "all" | "each-context";
    limit: number;
}

interface Modifier {
    name: string;
    contexts: string[];
    default?: string;
    declared: Node;
}

export function fromTokenFiles(files: { path: string; json?: JsonFile }[]): Built {
    return {
        permutations: [
            {
                input: {},
                label: "",
                contexts: [],
                sources: files.map(({ path, json }) => ({
                    source: { file: path, sets: [], readBy: "everyone" },
                    pieces: [{ file: path, ...(json && { json, tree: json.root }) }],
                })),
            },
        ],
    };
}

export function fromResolver(
    resolver: CheckedResolver,
    part: Resolver,
    items: ExpandedItem[],
    sources: Map<SourceEntry, LoadedSource>,
    options: PermutationOptions,
    diagnostics: Diagnostic[],
): Built {
    const modifiers = modifiersOf(items);
    const inputs = chooseInputs(modifiers, options, { diagnostics, file: resolver.file });
    const contextOf = (modifier: string, name: string | undefined) =>
        part.modifiers
            .find((each) => each.name === modifier)
            ?.contexts.find((each) => each.name === name);
    const listed = listedSources(items, sources, contextOf);
    return {
        permutations: inputs.map((input) => ({
            input,
            label: permutationLabel(input),
            contexts: modifiers.flatMap(({ name }) => contextOf(name, input[name]) ?? []),
            sources: sourcesFor(items, listed, contextOf, input),
        })),
    };
}

type ContextOf = (modifier: string, name: string | undefined) => ResolverContext | undefined;

function modifiersOf(items: ExpandedItem[]): Modifier[] {
    return items.flatMap((item) =>
        item.kind === "modifier"
            ? [
                  {
                      name: item.modifier.name,
                      contexts: [...item.contexts.keys()],
                      declared: item.modifier.declared,
                      ...(item.modifier.default !== undefined && {
                          default: item.modifier.default,
                      }),
                  },
              ]
            : [],
    );
}

interface Reporting {
    diagnostics: Diagnostic[];
    file: JsonFile;
}

function chooseInputs(
    modifiers: Modifier[],
    { inputs, permutations, limit }: PermutationOptions,
    reporting: Reporting,
): Input[] {
    const { diagnostics } = reporting;
    if (modifiers.length === 0) return [{}];
    if (inputs) {
        const checked = inputs.flatMap((raw, index) => {
            const input = checkInput(modifiers, raw, index, diagnostics);
            return input ? [input] : [];
        });
        return distinct(modifiers, checked);
    }
    return permutations === "each-context"
        ? eachContext(modifiers, reporting)
        : allCombinations(modifiers, limit, reporting);
}

function distinct(modifiers: Modifier[], inputs: Input[]): Input[] {
    const seen = new Set<string>();
    return inputs.filter((input) => {
        const key = JSON.stringify(modifiers.map(({ name }) => input[name]));
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function checkInput(
    modifiers: Modifier[],
    raw: Record<string, unknown>,
    index: number,
    diagnostics: Diagnostic[],
): Input | undefined {
    const problems: Diagnostic[] = [];
    const chosen: Input = {};
    const mentioned = new Set<Modifier>();
    const invalid = (detail: DiagnosticDetailByKind["input-invalid"]) =>
        problems.push(diagnostic("input-invalid", detail));

    for (const [key, value] of Object.entries(raw)) {
        const modifier = findByName(modifiers, key, ({ name }) => name);
        if (!modifier) {
            invalid({
                reason: "unknown-modifier",
                input: index,
                modifier: key,
                valid: modifiers.map(({ name }) => name),
            });
            continue;
        }
        mentioned.add(modifier);
        if (typeof value !== "string") {
            invalid({ reason: "not-a-string", input: index, modifier: modifier.name });
            continue;
        }
        const context = findByName(modifier.contexts, value, (each) => each);
        if (context === undefined) {
            invalid({
                reason: "unknown-context",
                input: index,
                modifier: modifier.name,
                context: value,
                valid: modifier.contexts,
            });
            continue;
        }
        chosen[modifier.name] = context;
    }

    for (const modifier of modifiers) {
        if (mentioned.has(modifier) || modifier.default !== undefined) continue;
        invalid({
            reason: "missing-modifier",
            input: index,
            modifier: modifier.name,
            valid: modifier.contexts,
        });
    }

    diagnostics.push(...problems);
    return problems.length === 0 ? withDefaults(modifiers, chosen) : undefined;
}

export function findByName<T>(
    candidates: T[],
    wanted: string,
    nameOf: (candidate: T) => string,
): T | undefined {
    const exact = candidates.find((candidate) => nameOf(candidate) === wanted);
    if (exact !== undefined) return exact;
    const folded = candidates.filter(
        (candidate) => nameOf(candidate).toLowerCase() === wanted.toLowerCase(),
    );
    return folded.length === 1 ? folded[0] : undefined;
}

function allCombinations(modifiers: Modifier[], limit: number, reporting: Reporting): Input[] {
    const count = modifiers.reduce((product, { contexts }) => product * contexts.length, 1);
    if (count <= limit) {
        return modifiers.reduce<Input[]>(
            (inputs, { name, contexts }) =>
                inputs.flatMap((input) =>
                    contexts.map((context) => ({ ...input, [name]: context })),
                ),
            [{}],
        );
    }
    const built = eachContext(modifiers, reporting);
    reporting.diagnostics.push(
        diagnostic("permutation-limit", { count, limit, built: built.length }),
    );
    return built;
}

function eachContext(modifiers: Modifier[], { diagnostics, file }: Reporting): Input[] {
    const withoutDefault = modifiers.filter(({ default: fallback }) => fallback === undefined);
    const [first] = withoutDefault;
    if (first) {
        diagnostics.push(
            diagnostic(
                "no-default",
                { modifiers: withoutDefault.map(({ name }) => name) },
                { span: spanOf(file, first.declared) },
            ),
        );
    }
    const walked = modifiers.flatMap((modifier) =>
        hasDefaults(modifiers.filter((other) => other !== modifier))
            ? modifier.contexts.map((context) =>
                  withDefaults(
                      modifiers,
                      context === modifier.default ? {} : { [modifier.name]: context },
                  ),
              )
            : [],
    );
    return distinct(modifiers, walked);
}

function hasDefaults(modifiers: Modifier[]): boolean {
    return modifiers.every((modifier) => modifier.default !== undefined);
}

function withDefaults(modifiers: Modifier[], chosen: Input): Input {
    const input: Input = {};
    for (const { name, default: fallback } of modifiers) {
        const context = chosen[name] ?? fallback;
        if (context !== undefined) input[name] = context;
    }
    return input;
}

type Listed = (entry: SourceEntry, context?: ResolverContext) => ListedSource | undefined;

function listedSources(
    items: ExpandedItem[],
    sources: Map<SourceEntry, LoadedSource>,
    contextOf: ContextOf,
): Listed {
    const readBy = whoReadsEachSource(items, sources, contextOf);
    const listed = new Map<SourceEntry, Map<ResolverContext | undefined, ListedSource>>();
    return (entry, context) => {
        const loaded = sources.get(entry);
        if (!loaded) return undefined;
        const pieces = loaded.pieces ?? [loaded];
        if (pieces[0] !== loaded) return undefined;
        const byContext = listed.get(entry) ?? new Map<ResolverContext | undefined, ListedSource>();
        listed.set(entry, byContext);
        const found = byContext.get(context);
        if (found) return found;
        const source = {
            file: loaded.file,
            ...(loaded.pointer && { pointer: loaded.pointer }),
            ...(context && { context }),
            sets: route(entry),
            readBy: readBy.get(sourceKey(loaded)) ?? "everyone",
        };
        const made = { source, pieces };
        byContext.set(context, made);
        return made;
    };
}

function sourcesFor(
    items: ExpandedItem[],
    listed: Listed,
    contextOf: ContextOf,
    input: Input,
): ListedSource[] {
    return items.flatMap((item) => {
        if (item.kind === "set") return item.entries.flatMap((entry) => listed(entry) ?? []);
        const name = input[item.modifier.name];
        if (name === undefined) return [];
        const context = contextOf(item.modifier.name, name);
        const entries = item.contexts.get(name) ?? [];
        return entries.flatMap((entry) => listed(entry, context) ?? []);
    });
}

function route({ route: steps }: SourceEntry): SetOnRoute[] {
    return steps.map(({ name, extensions }) => ({
        name,
        ...(extensions && { extensions: plainObject(extensions) }),
    }));
}

function whoReadsEachSource(
    items: ExpandedItem[],
    sources: Map<SourceEntry, LoadedSource>,
    contextOf: ContextOf,
): Map<string, Source["readBy"]> {
    const readBy = new Map<string, Source["readBy"]>();
    const read = (entry: SourceEntry, context?: ResolverContext) => {
        const loaded = sources.get(entry);
        if (!loaded) return;
        const key = sourceKey(loaded);
        const existing = readBy.get(key);
        if (!context || existing === "everyone") {
            readBy.set(key, "everyone");
            return;
        }
        const list = existing ?? [];
        if (!list.includes(context)) list.push(context);
        readBy.set(key, list);
    };
    for (const item of items) {
        if (item.kind === "set") {
            for (const entry of item.entries) read(entry);
            continue;
        }
        for (const [name, entries] of item.contexts) {
            const context = contextOf(item.modifier.name, name);
            for (const entry of entries) read(entry, context);
        }
    }
    return readBy;
}

function sourceKey({ file, pointer }: LoadedSource): string {
    return JSON.stringify([file, pointer]);
}
