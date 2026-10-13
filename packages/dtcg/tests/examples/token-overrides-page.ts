// A token's detail page. It shows the value as written, then each theme that overrides it, with the
// file each value comes from.
import { acrossPermutations, token, type Document } from "@sugarcube-sh/dtcg";

declare const doc: Document;
const path = "color.danger";

const base = token(doc, path);
row("Base", base?.authored?.value, base?.source.at.file);

for (const { permutation, token: there, from } of acrossPermutations(doc, path)) {
    if (from && "modifier" in from) {
        row(permutation.label, there.authored?.value, there.source.at.file);
    }
}
