// A documentation page. It lists every token with its light and dark values, and which other tokens
// use it: every token in any theme.
import { read } from "@sugarcube-sh/dtcg/node";

const tokens = await read("tokens/tokens.resolver.json");

for (const path of tokens.tokenPaths()) {
    const light = tokens.permutation({ theme: "light" }).token(path);
    const dark = tokens.permutation({ theme: "dark" }).token(path);
    const users = new Set<string>();
    for (const reference of tokens.referencedBy(path)) users.add(reference.from);
    row(path, (light ?? dark)?.type, light?.resolved, dark?.resolved, [...users]);
}
