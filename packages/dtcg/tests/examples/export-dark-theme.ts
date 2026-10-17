// A web page that exports the dark theme as one DTCG file to download. Broken tokens are left out,
// and the page says which.
import { read, toDTCG } from "@sugarcube-sh/dtcg";

const tokens = await read("tokens.resolver.json", {
    readText: (p) => fetch(`/tokens/${p}`).then((r) => r.text()),
});
const { tokens: dark, skipped } = toDTCG(tokens, { theme: "dark" });
if (skipped.length) showMessage(`Left out broken tokens: ${skipped.join(", ")}`);
download("dark.tokens.json", JSON.stringify(dark, null, 2));
