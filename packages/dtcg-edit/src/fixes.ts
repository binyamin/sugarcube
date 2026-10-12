import type { Diagnostic, Project, Span } from "@sugarcube-sh/dtcg";
import { readReference } from "@sugarcube-sh/dtcg/values";
import type { Node } from "jsonc-parser";
import { fixTitles } from "./error-messages.js";
import type { Fix, TextEdit } from "./index.js";
import { inline, refString, removal, spliced } from "./json-text.js";
import { nodeAt } from "./project-text.js";
import { reread } from "./reread.js";

/**
 * The changes that would mend a diagnostic of this project, made from the facts the diagnostic
 * carries and the text of the files. Empty when nothing is known that would mend it.
 *
 * A safe fix, applied, leaves the place it mends reading clean and changes nothing else the
 * files mean. One that depends on other tokens, such as a pointer standing for part of a value,
 * is offered only when reading the project again with it applied shows that place clean. A fix
 * that is not safe is a likely guess, such as a similar name, for a person to confirm.
 *
 * @example
 * for (const diagnostic of project.doc.diagnostics) {
 *   for (const fix of fixesFor(project, diagnostic)) menu.add(fix.title, fix.edits);
 * }
 */
export function fixesFor(project: Project, diagnostic: Diagnostic): Fix[] {
    const fix = fixFor(project, diagnostic);
    return fix ? [fix] : [];
}

function fixFor(project: Project, diagnostic: Diagnostic): Fix | undefined {
    const { at } = diagnostic;
    if (!at) return undefined;
    const written = (span: Span) => nodeAt(project, span);

    switch (diagnostic.kind) {
        case "duplicate-key": {
            const earlier = diagnostic.related?.[0]?.at;
            const edits = earlier && deletion(project, earlier.file, written(earlier));
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
            if (type === "") return deleteEmptyType(project, at, written(at));
            if (similar === undefined) return undefined;
            return guess(fixTitles.useSimilar(similar), [replacing(at, similar)]);
        }
        case "invalid-property": {
            const { property, reference } = diagnostic.detail;
            if (reference !== undefined) {
                return guess(fixTitles.extendsAsReference(reference), [replacing(at, reference)]);
            }
            const node = written(at);
            if (property !== "$type" || node?.type !== "null") return undefined;
            return deleteEmptyType(project, at, node);
        }
        case "hex-string-color": {
            const { value, asObject } = diagnostic.detail;
            if (written(at)?.value !== value) return undefined;
            return safe(fixTitles.hexToObject, { ...range(at), text: inline(asObject) });
        }
        case "invalid-value":
            return valueFix(project, diagnostic.detail, at, written(at)?.value);
        case "malformed-pointer": {
            const { corrected } = diagnostic.detail;
            const node = written(at);
            const ref = node && refString(node);
            if (corrected === undefined || !ref) return undefined;
            const { offset, length } = ref;
            const text = JSON.stringify(corrected);
            return safe(fixTitles.writePointer(corrected), { file: at.file, offset, length, text });
        }
        case "unknown-property": {
            const similar = "similar" in diagnostic.detail ? diagnostic.detail.similar : undefined;
            if (similar === undefined) return undefined;
            return guess(fixTitles.useSimilar(similar), [replacing(at, similar)]);
        }
        case "missing-reference": {
            const { ref, similar } = diagnostic.detail;
            if (similar === undefined) return undefined;
            const uses = [at, ...(diagnostic.related ?? []).map((related) => related.at)];
            const edits = uses
                .filter((use) => aliases(written(use)?.value, ref))
                .map((use) => replacing(use, `{${similar}}`));
            return edits.length > 0 ? guess(fixTitles.useSimilar(similar), edits) : undefined;
        }
        default:
            return undefined;
    }
}

function valueFix(
    project: Project,
    detail: Extract<Diagnostic, { kind: "invalid-value" }>["detail"],
    at: Span,
    written: unknown,
): Fix | undefined {
    switch (detail.reason) {
        case "string-with-unit": {
            const { value, asObject, type } = detail;
            if (written !== value || !asObject) return undefined;
            return safe(fixTitles.measureAsObject(type), { ...range(at), text: inline(asObject) });
        }
        case "hex-not-six-digits": {
            const { value, sixDigits } = detail;
            if (written !== value || sixDigits === undefined) return undefined;
            return safe(fixTitles.fullHex(sixDigits), replacing(at, sixDigits));
        }
        case "short-hex-string": {
            const { value, expanded } = detail;
            if (written !== value) return undefined;
            return safe(fixTitles.fullHex(expanded), replacing(at, expanded));
        }
        case "alias-not-allowed-here": {
            const reference = readReference(detail.reference);
            if (written !== detail.reference || !reference || !("alias" in reference)) {
                return undefined;
            }
            const pointer = pointerTo(reference.alias);
            const change = { ...range(at), text: inline({ $ref: pointer }) };
            if (!readsClean(project, [change])) return undefined;
            return safe(fixTitles.referenceAsPointer(pointer), change);
        }
        default:
            return undefined;
    }
}

function deleteEmptyType(project: Project, at: Span, written: Node | undefined): Fix | undefined {
    const edits = deletion(project, at.file, written);
    if (!edits || !readsClean(project, edits)) return undefined;
    return { title: fixTitles.deleteType, safe: true, edits };
}

function readsClean(project: Project, edits: TextEdit[]): boolean {
    const [first] = edits;
    if (!first) return true;
    const { file } = first;
    const files = { ...project.files, [file]: spliced(project.files[file] ?? "", edits) };
    const { doc } = reread(project, files);
    const start = Math.min(...edits.map(({ offset }) => offset));
    const grown = edits.reduce((acc, { length, text }) => acc + text.length - length, 0);
    const end = Math.max(...edits.map(({ offset, length }) => offset + length)) + grown;
    return !doc.diagnostics.some(
        ({ at }) => at?.file === file && at.offset <= end && start <= at.offset + at.length,
    );
}

function aliases(written: unknown, ref: string): boolean {
    const reference = readReference(written);
    return reference !== undefined && "alias" in reference && reference.alias === ref;
}

function pointerTo(path: string): string {
    const steps = path.split(".").map((step) => step.replaceAll("~", "~0").replaceAll("/", "~1"));
    return `#/${steps.join("/")}/$value`;
}

function deletion(
    project: Project,
    file: string,
    written: Node | undefined,
): TextEdit[] | undefined {
    const text = project.files[file];
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

function replacing(at: Span, value: string): TextEdit {
    return { ...range(at), text: JSON.stringify(value) };
}

function safe(title: string, change: TextEdit): Fix {
    return { title, safe: true, edits: [change] };
}

function guess(title: string, edits: TextEdit[]): Fix {
    return { title, safe: false, edits };
}
