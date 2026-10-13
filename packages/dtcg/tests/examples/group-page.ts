// A group's page in a token editor: its subgroups, with how many tokens each holds, then its own
// tokens, with the value as written, the file it's in, and each theme that overrides it.
import { type DesignSystem } from "@sugarcube-sh/dtcg";

declare const ds: DesignSystem;
const path = "color";

const children = ds.permutation().group(path)?.children ?? [];

for (const child of children) {
    if (child.kind === "group") row(child.path, child.tokens.length);
}

for (const t of children) {
    if (t.kind !== "token") continue;
    const overrides = ds.permutations.flatMap((permutation) => {
        const there = permutation.token(t.path)?.valueFrom;
        return there?.source.context ? [`${permutation.label} in ${there.source.file}`] : [];
    });
    row(t.path, t.authored?.value, t.valueFrom.source.file, overrides.join(", "));
}
