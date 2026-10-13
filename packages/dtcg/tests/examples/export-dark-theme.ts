// A web page that exports the dark theme as one DTCG file to download. Broken tokens are left out,
// and the page says which.
import { read, toDTCG } from "@sugarcube-sh/dtcg";

const ds = await read("tokens.resolver.json", {
    readText: (p) => fetch(`/tokens/${p}`).then((r) => r.text()),
});
const { tokens, skipped } = toDTCG(ds, { theme: "dark" });
if (skipped.length) showMessage(`Left out broken tokens: ${skipped.join(", ")}`);
download("dark.tokens.json", JSON.stringify(tokens, null, 2));
