import type { DesignTokens, Diagnostic, Permutation, Span, Token } from "../index.js";

export function diagnosticsForIn(tokens: DesignTokens, path: string): Diagnostic[] {
    const taking = tokens.permutations.flatMap((each) => {
        const token = each.token(path);
        return token ? [{ permutation: each, token }] : [];
    });
    return tokens.diagnostics.filter(
        (found) =>
            isAbout(found, path) ||
            taking.some(({ permutation, token }) => inValueFrom(tokens, found, permutation, token)),
    );
}

export function diagnosticsIn(
    tokens: DesignTokens,
    permutation: Permutation,
    path: string,
): Diagnostic[] {
    const token = permutation.token(path);
    return tokens.diagnostics.filter(
        (found) =>
            (isAbout(found, path) ||
                (token !== undefined && inValueFrom(tokens, found, permutation, token))) &&
            found.permutations.includes(permutation),
    );
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
