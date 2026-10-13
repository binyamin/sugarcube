import { diagnosticMessages } from "../error-messages.js";
import type { Diagnostic, DiagnosticDetailByKind, DiagnosticKind, Input } from "../index.js";

export type DiagnosticExtra = Partial<Pick<Diagnostic, "span" | "path" | "related" | "tags">> & {
    permutation?: Input;
};

export function diagnostic<K extends DiagnosticKind>(
    kind: K,
    detail: DiagnosticDetailByKind[K],
    { permutation, ...extra }: DiagnosticExtra = {},
): Diagnostic {
    const { severity, message } = diagnosticMessages[kind];
    return {
        kind,
        severity: typeof severity === "function" ? severity(detail) : severity,
        message: message(detail),
        ...extra,
        ...(permutation !== undefined && { permutations: [permutation] }),
        docs: docsFor(kind, detail),
        detail,
    } as Diagnostic;
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

export function collapse(diagnostics: Diagnostic[], inputs: Input[]): Diagnostic[] {
    const alike = new Map<string, Diagnostic>();
    for (const found of diagnostics) {
        const key = JSON.stringify({ ...found, permutations: undefined });
        const earlier = alike.get(key);
        if (!earlier) alike.set(key, found);
        else if (earlier.permutations && found.permutations) {
            const both = new Set([...earlier.permutations, ...found.permutations]);
            earlier.permutations = inputs.filter((input) => both.has(input));
        }
    }
    const collapsed = [...alike.values()];
    for (const found of collapsed) {
        if (found.permutations?.length === inputs.length) delete found.permutations;
    }
    return collapsed;
}
