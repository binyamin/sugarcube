// Generates padding utility classes (`.p-sm`, `.p-md` and so on), one for each token in the `space`
// group.
import { type DesignTokens } from "@sugarcube-sh/dtcg";
import { cssName, cssVariable } from "@sugarcube-sh/dtcg/css";

declare const tokens: DesignTokens;

for (const t of tokens.permutation().group("space")?.tokens ?? []) {
    if (t.type !== "dimension") continue;
    const suffix = cssName(t.path.slice("space.".length));
    row(`.p-${suffix} { padding: var(${cssVariable(t.path)}); }`);
}
