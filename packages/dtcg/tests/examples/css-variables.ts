// Turns tokens into CSS custom properties. The default theme goes on `:root`; each other theme gets
// a block with only what differs from it, and every variable referring to that, so a theme set on
// any element gives the right values there.
import { type DesignTokens, type Permutation } from "@sugarcube-sh/dtcg";
import { cssBlocks, cssText, cssWriter } from "@sugarcube-sh/dtcg/css";

declare const tokens: DesignTokens;
declare function selectorFor(p: Permutation): string;

const writer = cssWriter({ naming: { prefix: "ds" } });
const base = tokens.permutation();
const others = tokens.permutations.filter((p) => p !== base);

const blocks = cssBlocks(
    [base, ...others].map((p) => ({
        declarations: writer.declarations(p).declarations,
        selector: p === base ? ":root" : selectorFor(p),
    })),
);
row(cssText(blocks));
