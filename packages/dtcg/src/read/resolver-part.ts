import type { Node } from "jsonc-parser";
import type {
    Diagnostic,
    Resolver,
    ResolverModifier,
    ResolverSet,
    SourceRef,
    Span,
} from "../index.js";
import { diagnostic } from "./diagnostics.js";
import { member, plainObject, spanOf } from "./json.js";
import { folderOf, join } from "./paths.js";
import { encodePointer, readPointerText } from "./pointer.js";
import type { CheckedResolver, ModifierDefinition, SetDefinition, SourceNode } from "./resolver.js";
import { type SetsUsed, fileRef, setNamed } from "./sources.js";

export function resolverPart(
    resolver: CheckedResolver,
    setsUsed: SetsUsed,
    diagnostics: Diagnostic[],
): Resolver {
    const named = resolver.order.flatMap((item) => (item.kind === "set" ? [item.set] : []));
    const sets = new Map(named.map((set) => [set.name, set]));
    for (const reached of setsUsed.reached) {
        const set = resolver.sets.get(reached);
        if (set && !sets.has(reached)) sets.set(reached, set);
    }
    const modifiers = resolver.order.flatMap((item) =>
        item.kind === "modifier" ? [item.modifier] : [],
    );

    const reportUnused = (
        item: "set" | "modifier",
        declared: Map<string, { declared: Node }>,
        used: Set<string>,
    ) => {
        for (const [name, { declared: node }] of declared) {
            if (used.has(name)) continue;
            const at = spanAt(resolver, node);
            const detail = { item, name };
            diagnostics.push(
                diagnostic("not-in-resolution-order", detail, { at, tags: ["unnecessary"] }),
            );
        }
    };
    reportUnused("set", resolver.sets, new Set([...sets.keys(), ...setsUsed.pointedInto]));
    reportUnused("modifier", resolver.modifiers, new Set(modifiers.map(({ name }) => name)));

    const { file, version, name, description } = resolver;
    return {
        file: file.path,
        ...(version !== undefined && { version }),
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        sets: inWrittenOrder([...sets.values()]).map((set) => publicSet(resolver, set)),
        modifiers: inWrittenOrder(modifiers).map((each) => publicModifier(resolver, each)),
        order: resolver.order.map((item) =>
            item.kind === "set" ? { set: item.set.name } : { modifier: item.modifier.name },
        ),
    };
}

function publicSet(resolver: CheckedResolver, set: SetDefinition): ResolverSet {
    const extensions = set.extensions && plainObject(set.extensions);
    return {
        name: set.name,
        ...(set.description !== undefined && { description: set.description }),
        ...(extensions && { extensions }),
        sources: sourcesAsWritten(resolver, set.sources),
        at: spanAt(resolver, set.declared),
    };
}

function publicModifier(resolver: CheckedResolver, modifier: ModifierDefinition): ResolverModifier {
    const extensions = modifier.extensions && plainObject(modifier.extensions);
    return {
        name: modifier.name,
        ...(modifier.description !== undefined && { description: modifier.description }),
        ...(extensions && { extensions }),
        contexts: [...modifier.contexts].map(([context, { sources, declared }]) => ({
            name: context,
            sources: sourcesAsWritten(resolver, sources),
            at: spanAt(resolver, declared),
        })),
        ...(modifier.default !== undefined && { default: modifier.default }),
        at: spanAt(resolver, modifier.declared),
    };
}

function sourcesAsWritten(resolver: CheckedResolver, sources: SourceNode[]): SourceRef[] {
    return sources.flatMap((source) => sourceAsWritten(resolver, source) ?? []);
}

function sourceAsWritten(resolver: CheckedResolver, source: SourceNode): SourceRef | undefined {
    const { file } = resolver;
    const ref = member(source.node, "$ref");
    if (!ref) return { file: file.path, pointer: encodePointer(source.path) };
    if (ref.type !== "string") return undefined;
    const written = ref.value as string;
    if (!written.startsWith("#")) {
        const { file: named, read } = fileRef(written);
        if (read && !read.ok) return undefined;
        const steps = read?.steps ?? [];
        const pointer = steps.length > 0 ? { pointer: encodePointer(steps) } : {};
        return { file: join(folderOf(file.path), named), ...pointer };
    }
    const read = readPointerText(written);
    if (!read.ok) return undefined;
    const set = setNamed(read.steps);
    if (set !== undefined) return resolver.sets.has(set) ? { set } : undefined;
    return { file: file.path, pointer: encodePointer(read.steps) };
}

function inWrittenOrder<T extends { declared: Node }>(items: T[]): T[] {
    return [...items].sort((a, b) => a.declared.offset - b.declared.offset);
}

function spanAt({ file }: CheckedResolver, node: Node): Span {
    return spanOf(file.path, file.lineStarts, node.offset, node.length);
}
