import type { DesignTokens, Diagnostic, Permutation, Span, Token } from "../index.js";

export function diagnosticsForIn(tokens: DesignTokens, path: string): Diagnostic[] {
    return tokens.diagnostics.filter(concerning(tokens, path, tokens.permutations));
}

export function diagnosticsIn(
    tokens: DesignTokens,
    permutation: Permutation,
    path: string,
): Diagnostic[] {
    const about = concerning(tokens, path, [permutation]);
    return tokens.diagnostics.filter(
        (found) => found.permutations.includes(permutation) && about(found),
    );
}

function concerning(
    tokens: DesignTokens,
    path: string,
    permutations: readonly Permutation[],
): (found: Diagnostic) => boolean {
    const taking = permutations.flatMap((each) => {
        const token = each.token(path);
        return token ? [{ permutation: each, token }] : [];
    });
    return (found) =>
        isAbout(found, path) ||
        taking.some(({ permutation, token }) => inValueFrom(tokens, found, permutation, token));
}

function inValueFrom(
    tokens: DesignTokens,
    { span, path }: Diagnostic,
    permutation: Permutation,
    token: Token,
): boolean {
    if (span === undefined || path === undefined || path === token.path) return false;
    const from = tokens.spanOf(token.valueFrom);
    const other = permutation.token(path);
    return (
        other !== undefined &&
        tokens.spanOf(other.valueFrom) === from &&
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
