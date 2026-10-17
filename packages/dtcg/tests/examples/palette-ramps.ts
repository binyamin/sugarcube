// A palette page. Groups of plain colors show as swatch ramps, and colors that point at a palette
// show underneath as roles, each with the swatch it points at.
import { type ColorValue, type DesignTokens } from "@sugarcube-sh/dtcg";

declare const tokens: DesignTokens;
declare function swatch(color: ColorValue | undefined): string;

const permutation = tokens.permutation();

for (const group of permutation.groups) {
    const ramp = group.children.flatMap((child) =>
        child.kind === "token" && child.type === "color" && !child.referenceAt()
            ? [swatch(child.resolved)]
            : [],
    );
    if (ramp.length > 0) row(group.path, ...ramp);
}

for (const t of permutation.tokens) {
    if (t.type !== "color") continue;
    const target = t.referenceAt();
    if (target) row(t.path, target.path ?? "", swatch(t.resolved));
}
