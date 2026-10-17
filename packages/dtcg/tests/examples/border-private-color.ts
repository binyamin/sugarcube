// Writes a border as CSS when its color points at a private (e.g. not exported as a variable) palette token. That one color is
// written as its value, and every other reference stays a CSS variable. A pointer into part of
// another token's value has no variable of its own, so it is written as its value too.
import { type DesignTokens, type Input } from "@sugarcube-sh/dtcg";
import { cssValue, cssVariable } from "@sugarcube-sh/dtcg/css";

declare const tokens: DesignTokens;
declare const input: Input;
declare function isPrivateToken(t: { path: string }): boolean;

const border = tokens.permutation(input).token("border.card");
const css =
    border &&
    cssValue(border, {
        replacement: ({ token }) =>
            token && !isPrivateToken(token) ? { variable: cssVariable(token.path) } : undefined,
    });
if (typeof css === "string") row(css);
