import type { DesignTokens, Diagnostic, Span, Token } from "../index.js";

export function diagnosticsForIn(tokens: DesignTokens, path: string): Diagnostic[] {
    const taking = tokens.permutations.flatMap((each) => each.token(path) ?? []);
    return tokens.diagnostics.filter(
        (found) => isAbout(found, path) || taking.some((token) => inValueFrom(found, token)),
    );
}

export function diagnosticsOf(tokens: DesignTokens, token: Token): Diagnostic[] {
    return tokens.diagnostics.filter(
        (found) =>
            (isAbout(found, token.path) || inValueFrom(found, token)) &&
            found.permutations.includes(token.permutation),
    );
}

function inValueFrom({ span, path }: Diagnostic, token: Token): boolean {
    if (span === undefined || path === undefined || path === token.path) return false;
    const from = token.valueFrom.span;
    return (
        token.permutation.token(path)?.valueFrom.span === from &&
        span.file === from.file &&
        from.offset <= span.offset &&
        span.offset + span.length <= from.offset + from.length
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
