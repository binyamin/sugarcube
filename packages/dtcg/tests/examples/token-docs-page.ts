// A documentation page. It lists every token with its light and dark values, and which other tokens
// use it: every token in any theme.
import { read } from "@sugarcube-sh/dtcg/node";

const ds = await read("tokens/tokens.resolver.json");

for (const path of ds.tokenPaths()) {
    const light = ds.permutation({ theme: "light" }).token(path);
    const dark = ds.permutation({ theme: "dark" }).token(path);
    const users = new Set<string>();
    for (const reference of ds.referencedBy(path)) users.add(reference.from);
    row(path, (light ?? dark)?.type, light?.resolved, dark?.resolved, [...users]);
}
