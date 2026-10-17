// Adds a theme built on dark, then gives it one color of its own.
import { type DesignTokens } from "@sugarcube-sh/dtcg";
import { addContext, setValue, commit } from "@sugarcube-sh/dtcg-edit";

declare let tokens: DesignTokens;

let done = commit(
    tokens,
    addContext(tokens, "theme", "dim", { file: "dim.json", basedOn: "dark" }),
);
if (!done.tokens) throw new Error("could not add the dim theme");
tokens = done.tokens;

done = commit(tokens, setValue(tokens, "color.surface", "#2a2a2e", { input: { theme: "dim" } }));
if (done.tokens) tokens = done.tokens;
