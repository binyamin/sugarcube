// When the dark theme changes one color, finds every token that depends on it, directly or through
// others, so each can be restated for dark.
import { permutation, referrers, type Document } from "@sugarcube-sh/dtcg";

declare const doc: Document;
const dark = permutation(doc, { theme: "dark" });

const restate = dark ? referrers(dark, "color.brand", { transitive: true }).map((t) => t.path) : [];
row(restate.join(", "));
