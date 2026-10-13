import { read } from "@sugarcube-sh/dtcg/node";
// A dev server serving a token editor. The editor needs the files' text as well as the tokens, and
// the design tokens keep both.

const tokens = await read("tokens/tokens.resolver.json");
row(tokens.files.length, tokens.text("tokens.resolver.json")?.length, tokens.diagnostics.length);
