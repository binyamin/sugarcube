// Finds colors with the same value under different names, and suggests pointing one at the other.
import { defaultPermutation, sameValue, type Document, type Token } from "@sugarcube-sh/dtcg";

declare const doc: Document;

const colors = (defaultPermutation(doc)?.tokens ?? []).filter(
    (t): t is Extract<Token, { type: "color" }> => t.type === "color" && !t.referenceAt(),
);

for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
        const a = colors[i];
        const b = colors[j];
        if (a?.resolved && b?.resolved && sameValue("color", a.resolved, b.resolved)) {
            comment(`${a.path} and ${b.path} are the same colour; alias one to the other`);
        }
    }
}
