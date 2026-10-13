// A lint rule that flags every color token without a description.
import { defaultPermutation, type Document } from "@sugarcube-sh/dtcg";

declare const doc: Document;

for (const t of defaultPermutation(doc)?.tokens ?? []) {
    const place = t.writtenAt.at(-1);
    if (t.type === "color" && !t.description && place) {
        report(place.span, `${t.path} has no description`);
    }
}
