import { diagnosticMessages } from "../error-messages.js";
import type {
    Diagnostic,
    DiagnosticDetailByKind,
    DiagnosticKind,
    Input,
    Permutations,
} from "../index.js";
import { permutationsOf } from "./linked.js";

const foundIn = new WeakMap<Diagnostic, Input[]>();

export type DiagnosticExtra = Partial<Pick<Diagnostic, "span" | "path" | "related" | "tags">> & {
    permutation?: Input;
};

export function diagnostic<K extends DiagnosticKind>(
    kind: K,
    detail: DiagnosticDetailByKind[K],
    { permutation, ...extra }: DiagnosticExtra = {},
): Diagnostic {
    const { severity, message } = diagnosticMessages[kind];
    const made = {
        kind,
        severity: typeof severity === "function" ? severity(detail) : severity,
        message: message(detail),
        ...extra,
        docs: docsFor(kind, detail),
        detail,
    } as Diagnostic;
    if (permutation !== undefined) foundIn.set(made, [permutation]);
    return made;
}

function docsFor<K extends DiagnosticKind>(kind: K, detail: DiagnosticDetailByKind[K]): string {
    const page = `https://sugarcube.sh/errors/${kind}`;
    if (kind !== "invalid-value") return page;
    return `${page}#${(detail as DiagnosticDetailByKind["invalid-value"]).reason}`;
}

export function onceEach(diagnostics: Diagnostic[]): Diagnostic[] {
    const seen = new Set<string>();
    return diagnostics.filter((found) => {
        const key = JSON.stringify(found);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export function inReadingPermutations(
    diagnostics: Diagnostic[],
    permutations: Permutations,
): Diagnostic[] {
    for (const found of diagnostics) {
        const file = found.span?.file;
        if (file === undefined || foundIn.has(found)) continue;
        const reading = permutations.filter(({ sources }) =>
            sources.some((each) => each.file === file),
        );
        if (reading.length > 0 && reading.length < permutations.length) {
            found.permutations = permutationsOf(reading, permutations);
        }
    }
    return diagnostics;
}

export function alsoFoundIn(found: Diagnostic, permutation: Input): void {
    const inputs = foundIn.get(found);
    if (inputs && !inputs.includes(permutation)) inputs.push(permutation);
}

export function collapse(diagnostics: Diagnostic[], permutations: Permutations): Diagnostic[] {
    const alike = new Map<string, Diagnostic>();
    for (const found of diagnostics) {
        const key = JSON.stringify(found);
        const earlier = alike.get(key);
        const theirs = foundIn.get(found);
        const ours = earlier && foundIn.get(earlier);
        if (!earlier) alike.set(key, found);
        else if (ours && theirs) foundIn.set(earlier, [...ours, ...theirs]);
    }
    const collapsed = [...alike.values()];
    for (const found of collapsed) {
        const inputs = foundIn.get(found);
        const narrowed = permutations.filter(({ input }) => inputs?.includes(input));
        if (inputs && narrowed.length < permutations.length) {
            found.permutations = permutationsOf(narrowed, permutations);
        }
    }
    return collapsed;
}
