// Writes a border as CSS when its color points at a private (e.g. not exported as a variable) palette token. That one color is
// written as its value, and every other reference stays a CSS variable. A pointer into part of
// another token's value has no variable of its own, so it is written as its value too.
import { type DesignTokens, type Input, type Part } from "@sugarcube-sh/dtcg";

declare const tokens: DesignTokens;
declare const input: Input;
declare function isPrivateToken(t: { path: string }): boolean;
declare function cssName(path: string): string;
declare function cssValue(part: Part): string;

const write = (part: Part): string => {
    const target = part.ref?.token;
    return target && !isPrivateToken(target) ? `var(--${cssName(target.path)})` : cssValue(part);
};

const border = tokens.permutation(input).token("border.card");
const value = border?.parts;
if (value?.type === "border") {
    row([value.width, value.style, value.color].map(write).join(" "));
}
