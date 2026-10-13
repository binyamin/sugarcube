// Generates padding utility classes (`.p-sm`, `.p-md` and so on), one for each token in the `space`
// group.
import { type DesignSystem } from "@sugarcube-sh/dtcg";

declare const ds: DesignSystem;
declare function cssName(path: string): string;

const base = ds.permutation().input;
for (const t of ds.permutation(base).group("space")?.tokens ?? []) {
    if (t.type !== "dimension") continue;
    const suffix = t.path.slice("space.".length).replaceAll(".", "-");
    row(`.p-${suffix} { padding: var(--${cssName(t.path)}); }`);
}
