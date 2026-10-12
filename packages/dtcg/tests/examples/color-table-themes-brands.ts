// A table of every color in every combination of theme and brand: light and dark, default brand and
// ocean.
import { read, permutation, token, tokenPaths } from "@sugarcube-sh/dtcg";

const doc = await read("tokens.resolver.json", {
    readText: (p) => fetch(p).then((r) => r.text()),
    inputs: [{}, { theme: "dark" }, { brand: "ocean" }, { theme: "dark", brand: "ocean" }],
});

row("", ...doc.permutations.map((p) => p.label));
for (const path of tokenPaths(doc)) {
    const each = doc.permutations.map((p) => token(p, path));
    if (each.some((t) => t?.type === "color")) row(path, ...each.map((t) => t?.resolved));
}
const darkOcean = permutation(doc, { theme: "dark", brand: "ocean" });
if (darkOcean) showMessage(`${darkOcean.tokens.length} tokens in ${darkOcean.label}`);
