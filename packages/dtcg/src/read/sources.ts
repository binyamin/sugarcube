import type { Node } from "jsonc-parser";
import type { Diagnostic, JsonPath } from "../index.js";
import { type Files, openFile, parseFile } from "./files.js";
import { type JsonFile, member, members, spanOf } from "./json.js";
import { malformedPointer } from "./malformed-pointer.js";
import { folderOf, join } from "./paths.js";
import { encodePointer, follow, parsePointer, readPointerText } from "./pointer.js";
import {
    type ModifierDefinition,
    type Reader,
    type CheckedResolver,
    type SetDefinition,
    type SourceNode,
    createReader,
    isResolver,
    SET_KEYS,
    readSetParts,
    resolverProblem,
} from "./resolver.js";

export interface RouteStep {
    name: string;
    extensions?: Node;
}

export type SourceEntry =
    | {
          kind: "inline";
          node: Node;
          path: JsonPath;
          route: RouteStep[];
          overriddenKeys?: string[];
          pieces?: SourceEntry[];
      }
    | {
          kind: "file";
          file: string;
          fragment: string[];
          ref: Node;
          path: JsonPath;
          route: RouteStep[];
          overriddenKeys?: string[];
          pieces?: SourceEntry[];
      };

export type ExpandedItem =
    | { kind: "set"; set: SetDefinition; entries: SourceEntry[] }
    | { kind: "modifier"; modifier: ModifierDefinition; contexts: Map<string, SourceEntry[]> };

export interface LoadedSource {
    file: string;
    pointer?: string;
    json?: JsonFile;
    tree?: Node;
    overriddenKeys?: string[];
    pieces?: LoadedSource[];
}

export interface SetsUsed {
    reached: Set<string>;
    pointedInto: Set<string>;
}

export function expandSources(
    resolver: CheckedResolver,
    diagnostics: Diagnostic[],
): { items: ExpandedItem[]; setsUsed: SetsUsed } {
    const setsUsed: SetsUsed = { reached: new Set(), pointedInto: new Set() };
    const expander: Expander = {
        reader: createReader(resolver.file, diagnostics),
        root: resolver.file.root,
        sets: resolver.sets,
        expanded: new Map(),
        setsUsed,
    };
    const expand = (sources: SourceNode[], route: RouteStep[]) =>
        expandList(expander, sources, route, []);
    const items = resolver.order.map((item): ExpandedItem =>
        item.kind === "set"
            ? { kind: "set", set: item.set, entries: expand(item.set.sources, [stepOf(item.set)]) }
            : {
                  kind: "modifier",
                  modifier: item.modifier,
                  contexts: new Map(
                      [...item.modifier.contexts].map(([context, { sources }]) => [
                          context,
                          expand(sources, []),
                      ]),
                  ),
              },
    );
    return { items, setsUsed };
}

export function entriesOf(items: ExpandedItem[]): SourceEntry[] {
    return items.flatMap((item) =>
        item.kind === "set" ? item.entries : [...item.contexts.values()].flat(),
    );
}

export function filesNamedBy(resolver: CheckedResolver, entries: SourceEntry[]): string[] {
    const folder = folderOf(resolver.file.path);
    return entries.flatMap((entry) => (entry.kind === "file" ? [join(folder, entry.file)] : []));
}

export function openSources(
    files: Files,
    resolver: CheckedResolver,
    entries: SourceEntry[],
): Map<SourceEntry, LoadedSource> {
    const opened = new Map(entries.map((entry) => [entry, openSource(files, resolver, entry)]));
    for (const [entry, loaded] of opened) {
        if (entry.pieces) loaded.pieces = entry.pieces.flatMap((each) => opened.get(each) ?? []);
    }
    return opened;
}

function openSource(files: Files, resolver: CheckedResolver, entry: SourceEntry): LoadedSource {
    const overridden = entry.overriddenKeys && { overriddenKeys: entry.overriddenKeys };
    if (entry.kind === "inline") {
        return {
            file: resolver.file.path,
            pointer: encodePointer(entry.path),
            json: resolver.file,
            tree: entry.node,
            ...overridden,
        };
    }

    const path = join(folderOf(resolver.file.path), entry.file);
    const pointer = entry.fragment.length > 0 ? { pointer: encodePointer(entry.fragment) } : {};
    const refText = entry.ref.value as string;
    const at = [...entry.path, "$ref"];
    const report = (problem: Parameters<typeof resolverProblem>[1]) =>
        files.diagnostics.push(resolverProblem(resolver.file, problem, entry.ref));

    const root = parseFile(files, path)?.root;
    if (root && isResolver(root)) {
        openFile(files, path, "resolver");
        report({ rule: "resolver-as-source", name: path, at });
        return { file: path, ...pointer };
    }

    const json = openFile(files, path, "tokens", {
        file: resolver.file.path,
        at: spanOf(
            resolver.file.path,
            resolver.file.lineStarts,
            entry.ref.offset,
            entry.ref.length,
        ),
    });
    if (!json) return { file: path, ...pointer };

    const followed = follow(json.root, entry.fragment);
    if (!followed.ok) {
        report({ rule: "invalid-pointer", name: refText, at });
        return { file: path, ...pointer };
    }
    if (followed.node.type !== "object") {
        report({ rule: "wrong-type", name: refText, at, expected: "object" });
        return { file: path, ...pointer };
    }
    return { file: path, ...pointer, json, tree: followed.node, ...overridden };
}

interface Expander {
    reader: Reader;
    root: Node;
    sets: Map<string, SetDefinition>;
    expanded: Map<Node, Map<string, SourceEntry[]>>;
    setsUsed: SetsUsed;
}

function expandList(
    expander: Expander,
    sources: SourceNode[],
    route: RouteStep[],
    seen: string[],
): SourceEntry[] {
    return sources.flatMap((source) => expandSource(expander, source, route, seen));
}

function expandSource(
    expander: Expander,
    source: SourceNode,
    route: RouteStep[],
    seen: string[],
): SourceEntry[] {
    const byRoute = expander.expanded.get(source.node) ?? new Map<string, SourceEntry[]>();
    expander.expanded.set(source.node, byRoute);
    const key = route
        .map(({ name, extensions }) => `${name}@${extensions?.offset ?? ""}`)
        .join(" ");
    const cached = byRoute.get(key);
    if (cached) return cached;
    const entries = followSource(expander, source, route, seen);
    byRoute.set(key, entries);
    return entries;
}

function followSource(
    expander: Expander,
    source: SourceNode,
    route: RouteStep[],
    seen: string[],
    pointedFrom: SourceNode[] = [],
): SourceEntry[] {
    const { reader, root, sets, setsUsed } = expander;
    const refNode = member(source.node, "$ref");
    if (!refNode) return [{ kind: "inline", node: source.node, path: source.path, route }];

    const at = [...source.path, "$ref"];
    if (!reader.expect(refNode, "string", "$ref", at)) return [];
    const ref = refNode.value as string;
    const overriding = [source, ...pointedFrom];

    if (!ref.startsWith("#")) {
        const { file, read } = fileRef(ref);
        if (read && !read.ok) {
            const corrected = `${file}${read.corrected}`;
            const detail = malformedPointer(ref, { ...read, corrected }, true);
            reader.diagnose("malformed-pointer", detail, refNode);
            return [];
        }
        const steps = read?.steps ?? [];
        const entry: SourceEntry = {
            kind: "file",
            file,
            fragment: steps,
            ref: refNode,
            path: source.path,
            route,
        };
        return withOverrides([entry], overriding, route);
    }

    const read = readPointerText(ref);
    if (!read.ok) {
        const corrected = parsePointer(read.corrected);
        const reaches =
            corrected !== undefined && pointable(corrected) && follow(root, corrected).ok;
        reader.diagnose("malformed-pointer", malformedPointer(ref, read, reaches), refNode);
        return [];
    }
    const steps = read.steps;
    if (!pointable(steps)) {
        reader.report({ rule: "invalid-pointer", name: ref, at }, refNode);
        return [];
    }
    if (seen.includes(ref)) {
        reader.report({ rule: "circular-reference", name: ref, at }, refNode);
        return [];
    }

    const name = setNamed(steps);
    if (name !== undefined) {
        const target = sets.get(name);
        if (!target) {
            reader.report({ rule: "unknown-set", name, at }, refNode);
            return [];
        }
        setsUsed.reached.add(name);
        for (const each of overriding) reader.checkKeys(each, "set", ["$ref", ...SET_KEYS]);
        const set = overriding.some((each) => keysBeside(each).length > 0)
            ? Object.assign({ ...target }, ...overriding.map((each) => readSetParts(reader, each)))
            : target;
        return expandList(expander, set.sources, [...route, stepOf(set)], [...seen, ref]);
    }

    const followed = follow(root, steps);
    if (!followed.ok) {
        reader.report({ rule: "invalid-pointer", name: ref, at }, refNode);
        return [];
    }
    const [collection, inside] = steps;
    if (collection === "sets" && inside !== undefined) setsUsed.pointedInto.add(inside);
    if (!reader.expect(followed.node, "object", ref, at)) return [];
    const target = { node: followed.node, path: steps };
    if (member(target.node, "$ref")) {
        return followSource(expander, target, route, [...seen, ref], overriding);
    }
    const entries = expandSource(expander, target, route, [...seen, ref]);
    return withOverrides(entries, overriding, route);
}

function stepOf({ name, extensions }: SetDefinition): RouteStep {
    return { name, ...(extensions && { extensions }) };
}

export function setNamed(steps: string[]): string | undefined {
    const [collection, name, ...rest] = steps;
    return collection === "sets" && name !== undefined && rest.length === 0 ? name : undefined;
}

export function fileRef(ref: string): { file: string; read?: ReturnType<typeof readPointerText> } {
    const hash = ref.indexOf("#");
    if (hash === -1) return { file: ref };
    const fragment = ref.slice(hash + 1);
    const file = ref.slice(0, hash);
    return fragment === "" ? { file } : { file, read: readPointerText(`#${fragment}`) };
}

function keysBeside(source: SourceNode): string[] {
    return members(source.node)
        .map(({ key }) => key)
        .filter((key) => key !== "$ref");
}

function withOverrides(
    entries: SourceEntry[],
    overriding: SourceNode[],
    route: RouteStep[],
): SourceEntry[] {
    return overriding.reduce(
        (inner, source) => withOverride(inner, source, route, keysBeside(source)),
        entries,
    );
}

function withOverride(
    entries: SourceEntry[],
    source: SourceNode,
    route: RouteStep[],
    overridden: string[],
): SourceEntry[] {
    if (overridden.length === 0) return entries;
    const pieces: SourceEntry[] = [
        ...entries.map((entry) => ({
            ...entry,
            overriddenKeys: [...(entry.overriddenKeys ?? []), ...overridden],
        })),
        { kind: "inline", node: source.node, path: source.path, route, overriddenKeys: ["$ref"] },
    ];
    for (const piece of pieces) piece.pieces = pieces;
    return pieces;
}

function pointable([first]: string[]): boolean {
    return first !== "modifiers" && first !== "resolutionOrder";
}
