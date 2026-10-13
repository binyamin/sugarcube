// A token's detail page. It shows the value as written, then each theme that overrides it, with the
// file each value comes from.
import { type DesignTokens } from "@sugarcube-sh/dtcg";

declare const tokens: DesignTokens;
const path = "color.danger";

const base = tokens.permutation().token(path);
row("Base", base?.authored?.value, base?.valueFrom.source.file);

for (const permutation of tokens.permutations) {
    const there = permutation.token(path);
    if (there?.valueFrom.source.context) {
        row(permutation.label, there.authored?.value, there.valueFrom.source.file);
    }
}
