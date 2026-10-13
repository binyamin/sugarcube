// When the dark theme changes one color, finds every token that depends on it, directly or through
// others, so each can be restated for dark.
import { type DesignTokens } from "@sugarcube-sh/dtcg";

declare const tokens: DesignTokens;
const dark = tokens.permutation({ theme: "dark" });
const brand = dark.token("color.brand");

const restate = new Set<string>();
for (const reference of brand?.referencedBy({ chained: true }) ?? [])
    restate.add(reference.from.path);
row([...restate].join(", "));
