import type { DesignSystem, Diagnostic, Span } from "@sugarcube-sh/dtcg";
import { readReference } from "@sugarcube-sh/dtcg/values";
import type { Node } from "jsonc-parser";
import { fixTitles } from "./error-messages.js";
import type { Fix, TextEdit } from "./index.js";
import { inline, refString, removal, spliced } from "./json-text.js";
import { nodeAt } from "./file-text.js";

/**
 * The changes that would mend a diagnostic of this design system, made from the facts the
 * diagnostic carries and the text of the files. Empty when nothing is known that would mend it.
 *
 * A safe fix, applied, leaves the place it mends reading clean and changes nothing else the
 * files mean. One that depends on other tokens, such as a pointer standing for part of a value,
 * is offered only when reading the design system again with it applied shows that place clean. A
 * fix that is not safe is a likely guess, such as a similar name, for a person to confirm.
 *
 * @example
 * for (const diagnostic of ds.diagnostics) {
 *   for (const fix of fixesFor(ds, diagnostic)) menu.add(fix.title, fix.edits);
 * }
 */
export function fixesFor(ds: DesignSystem, diagnostic: Diagnostic): Fix[] {
    const fix = fixFor(ds, diagnostic);
    return fix ? [fix] : [];
}

function fixFor(ds: DesignSystem, diagnostic: Diagnostic): Fix | undefined {
    const { span } = diagnostic;
    if (!span) return undefined;

    switch (diagnostic.kind) {
        case "duplicate-key": {
            const earlier = diagnostic.related?.[0]?.span;
            const edits = earlier && deletion(ds, earlier.file, nodeAt(ds, earlier));
            return (
                edits && {
                    title: fixTitles.deleteEarlier(diagnostic.detail.key),
                    safe: true,
                    edits,
                }
            );
        }
        case "unknown-type": {
            const { type, similar } = diagnostic.detail;
            if (type === "") return deleteEmptyType(ds, span, nodeAt(ds, span));
            if (similar === undefined) return undefined;
            return guess(fixTitles.useSimilar(similar), [replacing(span, similar)]);
        }
        case "invalid-property": {
            const { property, reference } = diagnostic.detail;
            if (reference !== undefined) {
                return guess(fixTitles.extendsAsReference(reference), [replacing(span, reference)]);
            }
            const node = nodeAt(ds, span);
            if (property !== "$type" || node?.type !== "null") return undefined;
            return deleteEmptyType(ds, span, node);
        }
        case "hex-string-color": {
            const { value, asObject } = diagnostic.detail;
            if (nodeAt(ds, span)?.value !== value) return undefined;
            return safe(fixTitles.hexToObject, { ...range(span), text: inline(asObject) });
        }
        case "invalid-value":
            return valueFix(ds, diagnostic.detail, span, nodeAt(ds, span)?.value);
        case "malformed-pointer": {
            const { corrected } = diagnostic.detail;
            const node = nodeAt(ds, span);
            const ref = node && refString(node);
            if (corrected === undefined || !ref) return undefined;
            const { offset, length } = ref;
            const text = JSON.stringify(corrected);
            return safe(fixTitles.writePointer(corrected), {
                file: span.file,
                offset,
                length,
                text,
            });
        }
        case "unknown-property": {
            const similar = "similar" in diagnostic.detail ? diagnostic.detail.similar : undefined;
            if (similar === undefined) return undefined;
            return guess(fixTitles.useSimilar(similar), [replacing(span, similar)]);
        }
        case "missing-reference": {
            const { ref, similar } = diagnostic.detail;
            if (similar === undefined) return undefined;
            const uses = [span, ...(diagnostic.related ?? []).map((related) => related.span)];
            const edits = uses
                .filter((use) => writesCurlyBrace(nodeAt(ds, use)?.value, ref))
                .map((use) => replacing(use, `{${similar}}`));
            return edits.length > 0 ? guess(fixTitles.useSimilar(similar), edits) : undefined;
        }
        default:
            return undefined;
    }
}

function valueFix(
    ds: DesignSystem,
    detail: Extract<Diagnostic, { kind: "invalid-value" }>["detail"],
    span: Span,
    written: unknown,
): Fix | undefined {
    switch (detail.reason) {
        case "string-with-unit": {
            const { value, asObject, type } = detail;
            if (written !== value || !asObject) return undefined;
            return safe(fixTitles.measureAsObject(type), {
                ...range(span),
                text: inline(asObject),
            });
        }
        case "hex-not-six-digits": {
            const { value, sixDigits } = detail;
            if (written !== value || sixDigits === undefined) return undefined;
            return safe(fixTitles.fullHex(sixDigits), replacing(span, sixDigits));
        }
        case "short-hex-string": {
            const { value, expanded } = detail;
            if (written !== value) return undefined;
            return safe(fixTitles.fullHex(expanded), replacing(span, expanded));
        }
        case "curly-brace-not-allowed-here": {
            const reference = readReference(detail.reference);
            if (written !== detail.reference || reference?.syntax !== "curly-brace") {
                return undefined;
            }
            const pointer = pointerTo(reference.path);
            const change = { ...range(span), text: inline({ $ref: pointer }) };
            if (!readsClean(ds, [change])) return undefined;
            return safe(fixTitles.referenceAsPointer(pointer), change);
        }
        default:
            return undefined;
    }
}

function deleteEmptyType(ds: DesignSystem, span: Span, written: Node | undefined): Fix | undefined {
    const edits = deletion(ds, span.file, written);
    if (!edits || !readsClean(ds, edits)) return undefined;
    return { title: fixTitles.deleteType, safe: true, edits };
}

function readsClean(ds: DesignSystem, edits: TextEdit[]): boolean {
    const [first] = edits;
    if (!first) return true;
    const { file } = first;
    const after = ds.reread({ [file]: spliced(ds.text(file) ?? "", edits) });
    const start = Math.min(...edits.map(({ offset }) => offset));
    const grown = edits.reduce((acc, { length, text }) => acc + text.length - length, 0);
    const end = Math.max(...edits.map(({ offset, length }) => offset + length)) + grown;
    return after.diagnosticsAt({ file, offset: start, length: end - start }).length === 0;
}

function writesCurlyBrace(written: unknown, ref: string): boolean {
    const reference = readReference(written);
    return reference?.syntax === "curly-brace" && reference.path === ref;
}

function pointerTo(path: string): string {
    const steps = path.split(".").map((step) => step.replaceAll("~", "~0").replaceAll("/", "~1"));
    return `#/${steps.join("/")}/$value`;
}

function deletion(
    ds: DesignSystem,
    file: string,
    written: Node | undefined,
): TextEdit[] | undefined {
    const text = ds.text(file);
    if (!written || text === undefined) return undefined;
    const edits = removal(text, written).map(({ offset, length, text: replaced }) => ({
        file,
        offset,
        length,
        text: replaced,
    }));
    return edits.length > 0 ? edits : undefined;
}

function range({ file, offset, length }: Span): Omit<TextEdit, "text"> {
    return { file, offset, length };
}

function replacing(span: Span, value: string): TextEdit {
    return { ...range(span), text: JSON.stringify(value) };
}

function safe(title: string, change: TextEdit): Fix {
    return { title, safe: true, edits: [change] };
}

function guess(title: string, edits: TextEdit[]): Fix {
    return { title, safe: false, edits };
}
