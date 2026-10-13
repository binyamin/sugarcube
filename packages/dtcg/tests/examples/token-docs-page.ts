// A documentation page. It lists every token with its light and dark values, and which other tokens
// use it: every token in any theme.
import { read } from "@sugarcube-sh/dtcg/node";
import { token, tokenPaths } from "@sugarcube-sh/dtcg";

const doc = await read("tokens/tokens.resolver.json");

for (const path of tokenPaths(doc)) {
    const light = token(doc, path, { theme: "light" });
    const dark = token(doc, path, { theme: "dark" });
    const users = new Set<string>();
    for (const reference of doc.referencedBy(path)) users.add(reference.from);
    row(path, (light ?? dark)?.type, light?.resolved, dark?.resolved, [...users]);
}
