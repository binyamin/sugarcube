import { read } from "@sugarcube-sh/dtcg/node";
// A dev server serving a token editor. The editor needs the files' text as well as the tokens, and
// the design system keeps both.

const ds = await read("tokens/tokens.resolver.json");
row(ds.files.length, ds.text("tokens.resolver.json")?.length, ds.diagnostics.length);
