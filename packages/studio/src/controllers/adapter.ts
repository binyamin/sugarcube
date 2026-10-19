import type { DesignTokens, DiagnosticOf, ReadOptions, Token } from "@sugarcube-sh/dtcg";
import type { TypographyCSS } from "@sugarcube-sh/dtcg/css";

export type BuildProblem = DiagnosticOf<Record<string, unknown>>;

export interface Written {
    value(token: Token): string | TypographyCSS | undefined;
    readonly css: string;
    readonly problems: readonly BuildProblem[];
}

export interface BuildAdapter {
    readonly read: ReadOptions;
    write(tokens: DesignTokens): Written;
}
