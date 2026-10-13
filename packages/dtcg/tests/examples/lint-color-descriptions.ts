// A lint rule that flags every color token without a description.
import { defaultPermutation, type Document } from "@sugarcube-sh/dtcg";

declare const doc: Document;

for (const t of defaultPermutation(doc)?.tokens ?? []) {
    if (t.type === "color" && !t.description) report(t.source.at, `${t.path} has no description`);
}
