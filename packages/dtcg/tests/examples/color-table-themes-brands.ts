// A table of every color in every combination of theme and brand: light and dark, default brand and
// ocean.
import { read, byToken, permutation, token } from "@sugarcube-sh/dtcg";

const doc = await read("tokens.resolver.json", {
    readText: (p) => fetch(p).then((r) => r.text()),
    inputs: [{}, { theme: "dark" }, { brand: "ocean" }, { theme: "dark", brand: "ocean" }],
});

row("", ...doc.permutations.map((p) => p.label));
for (const view of byToken(doc)) {
    if (view.type !== "color") continue;
    const values = doc.permutations.map(({ input }) => token(doc, view.path, input)?.resolved);
    row(view.path, ...values);
}
const darkOcean = permutation(doc, { theme: "dark", brand: "ocean" });
if (darkOcean) showMessage(`${darkOcean.tokens.length} tokens in ${darkOcean.label}`);
