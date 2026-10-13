// A token's detail page. It shows the value as written, then each theme that overrides it, with the
// file each value comes from.
import { type DesignSystem } from "@sugarcube-sh/dtcg";

declare const ds: DesignSystem;
const path = "color.danger";

const base = ds.permutation().token(path);
row("Base", base?.authored?.value, base?.valueFrom.source.file);

for (const permutation of ds.permutations) {
    const there = permutation.token(path);
    if (there?.valueFrom.source.context) {
        row(permutation.label, there.authored?.value, there.valueFrom.source.file);
    }
}
