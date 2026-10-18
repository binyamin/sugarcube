import { relatedMessages } from "../error-messages.js";
import type { Input, Span, WrittenReference } from "../index.js";
import { movedReference, namedPath, referenceText } from "../values/references.js";
import { diagnostic, type Problems } from "./diagnostics.js";
import { similarName } from "./similar.js";

interface Missing {
    reference: WrittenReference;
    first: { from: string; span: Span };
    from: string[];
    uses: Span[];
}

interface MissingAcross {
    ref: string;
    similar: string | undefined;
    first: { from: string; span: Span };
    from: string[];
    uses: Span[];
    inputs: [Input, ...Input[]];
}

export interface MissingIn {
    record(reference: WrittenReference, from: string, span: Span): void;
    close(): void;
}

export interface MissingReferences {
    in(input: Input, paths: ReadonlyMap<string, unknown>): MissingIn;
    report(): void;
}

export function missingReferences(diagnostics: Problems): MissingReferences {
    const across = new Map<string, MissingAcross>();
    return {
        in: (input, paths) => {
            const missing = new Map<string, Missing>();
            return {
                record: (reference, from, span) => {
                    const ref = referenceText(reference);
                    const entry = missing.get(ref) ?? {
                        reference,
                        first: { from, span },
                        from: [],
                        uses: [],
                    };
                    if (!entry.from.includes(from)) entry.from.push(from);
                    entry.uses.push(span);
                    missing.set(ref, entry);
                },
                close: () => {
                    for (const [ref, { reference, first, from, uses }] of missing) {
                        const similar = similarReference(reference, paths, from);
                        const key = JSON.stringify([ref, similar]);
                        let entry = across.get(key);
                        if (entry) entry.inputs.push(input);
                        else {
                            entry = { ref, similar, first, from: [], uses: [], inputs: [input] };
                            across.set(key, entry);
                        }
                        for (const each of from)
                            if (!entry.from.includes(each)) entry.from.push(each);
                        for (const span of uses)
                            if (!entry.uses.includes(span)) entry.uses.push(span);
                    }
                },
            };
        },
        report: () => {
            for (const { ref, similar, first, from, uses, inputs } of across.values()) {
                const related = uses
                    .filter((span) => span !== first.span)
                    .map((span) => ({ message: relatedMessages.alsoUsedHere, span }));
                const detail = { ref, from, ...(similar !== undefined && { similar }) };
                const [input, ...others] = inputs;
                const made = diagnostic("missing-reference", detail, {
                    span: first.span,
                    path: first.from,
                    ...(related.length > 0 && { related }),
                });
                const found = diagnostics.found(made, input);
                for (const each of others) diagnostics.also(found, each);
            }
        },
    };
}

function similarReference(
    reference: WrittenReference,
    paths: ReadonlyMap<string, unknown>,
    from: string[],
): string | undefined {
    const named = namedPath(reference);
    if (named === undefined || paths.has(named)) return undefined;
    const close = similarName(
        named,
        [...paths.keys()].filter((path) => !from.includes(path)),
    );
    if (close === undefined) return undefined;
    return referenceText(movedReference(reference, [{ from: named, to: close }]));
}
