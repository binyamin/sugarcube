// A lint rule that flags every color token without a description.
import { type DesignSystem } from "@sugarcube-sh/dtcg";

declare const ds: DesignSystem;

for (const t of ds.permutation().tokens) {
    const place = t.valueFrom;
    if (t.type === "color" && !t.description && place) {
        report(place.span, `${t.path} has no description`);
    }
}
