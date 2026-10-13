// A group's page in a token editor: its subgroups, with how many tokens each holds, then its own
// tokens, with the value as written, the file it's in, and each theme that overrides it.
import {
    acrossPermutations,
    defaultPermutation,
    group,
    tokensIn,
    type Document,
} from "@sugarcube-sh/dtcg";

declare const doc: Document;
const path = "color";

const base = defaultPermutation(doc);
const children = (base && group(base, path)?.children) ?? [];

for (const child of children) {
    if (base && child.kind === "group") row(child.path, tokensIn(base, child.path).length);
}

for (const t of children) {
    if (t.kind !== "token") continue;
    const overrides = acrossPermutations(doc, t.path)
        .filter(({ from }) => from && "modifier" in from)
        .map(({ permutation, token: there }) => `${permutation.label} in ${there.source.at.file}`);
    row(t.path, t.authored?.value, t.source.at.file, overrides.join(", "));
}
