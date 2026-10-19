// Turns tokens into CSS custom properties. The default theme goes on `:root`; each other theme gets
// a block with only the declarations that differ from it. A reference is written as `var()`, so it
// follows its target wherever the target changes.
import { type DesignTokens, type Permutation, type Reference } from "@sugarcube-sh/dtcg";
import { cssValue, cssVariable } from "@sugarcube-sh/dtcg/css";

declare const tokens: DesignTokens;
declare function selectorFor(p: Permutation): string;

const replacement = (ref: Reference, cssProperty?: string) =>
    ref.token ? { variable: cssVariable(ref.token.path, { cssProperty }) } : undefined;

function declarations(p: Permutation): string[] {
    return p.tokens.flatMap((t) => {
        const css = cssValue(t, { replacement });
        const name = cssVariable(t.path);
        if (css === undefined) return [];
        if (typeof css === "string") return [`  ${name}: ${css};`];
        return Object.entries(css).map(
            ([cssProperty, value]) => `  ${cssVariable(t.path, { cssProperty })}: ${value};`,
        );
    });
}

const base = tokens.permutation();
const inBase = new Set(declarations(base));
for (const p of tokens.permutations) {
    const lines = p === base ? declarations(p) : declarations(p).filter((l) => !inBase.has(l));
    if (lines.length) row(`${p === base ? ":root" : selectorFor(p)} {\n${lines.join("\n")}\n}`);
}
