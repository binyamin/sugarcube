import type { DesignTokens, Diagnostic, Span, Token } from "../index.js";

export function diagnosticsForIn(tokens: DesignTokens, path: string): Diagnostic[] {
    return tokens.diagnostics.filter((found) => isAbout(found, path));
}

export function diagnosticsOf(tokens: DesignTokens, token: Token): Diagnostic[] {
    return diagnosticsForIn(tokens, token.path).filter(
        ({ permutations }) => !permutations || permutations.includes(token.permutation),
    );
}

export function diagnosticsAtIn(
    tokens: DesignTokens,
    { file, offset, length }: Pick<Span, "file" | "offset" | "length">,
): Diagnostic[] {
    const end = offset + length;
    return tokens.diagnostics.filter(
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
