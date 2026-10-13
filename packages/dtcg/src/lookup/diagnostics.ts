import type { DesignSystem, Diagnostic, Span, Token } from "../index.js";

export function diagnosticsForIn(ds: DesignSystem, path: string): Diagnostic[] {
    return ds.diagnostics.filter((found) => isAbout(found, path));
}

export function diagnosticsOf(ds: DesignSystem, token: Token): Diagnostic[] {
    return diagnosticsForIn(ds, token.path).filter(
        ({ permutations }) => !permutations || permutations.includes(token.permutation),
    );
}

export function diagnosticsAtIn(
    ds: DesignSystem,
    { file, offset, length }: Pick<Span, "file" | "offset" | "length">,
): Diagnostic[] {
    const end = offset + length;
    return ds.diagnostics.filter(
        ({ span }) =>
            span !== undefined &&
            span.file === file &&
            span.offset <= end &&
            offset <= span.offset + span.length,
    );
}

function isAbout(found: Diagnostic, path: string): boolean {
    if (found.path === path) return true;
    if (found.kind === "missing-reference") return found.detail.from.includes(path);
    if (found.kind === "circular-reference") return found.detail.chain.includes(path);
    return false;
}
