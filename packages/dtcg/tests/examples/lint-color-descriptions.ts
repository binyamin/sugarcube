// A lint rule that flags every color token without a description.
import { type DesignTokens } from "@sugarcube-sh/dtcg";

declare const tokens: DesignTokens;

for (const t of tokens.permutation().tokens) {
    const place = t.valueFrom;
    if (t.type === "color" && !t.description && place) {
        report(place.span, `${t.path} has no description`);
    }
}
