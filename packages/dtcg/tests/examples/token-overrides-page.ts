// A token's detail page. It shows the value as written, then each theme that overrides it, with the
// file each value comes from.
import { acrossPermutations, token, type Document } from "@sugarcube-sh/dtcg";

declare const doc: Document;
const path = "color.danger";

const base = token(doc, path);
row("Base", base?.authored?.value, base?.writtenAt.at(-1)?.span.file);

for (const { permutation, token: there } of acrossPermutations(doc, path)) {
    const place = there.writtenAt.at(-1);
    if (place?.source.context) row(permutation.label, there.authored?.value, place.span.file);
}
