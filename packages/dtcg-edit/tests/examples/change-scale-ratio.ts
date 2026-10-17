// Changes a spacing scale's ratio. The steps are remade from the new ratio when the tokens are read
// again.
import { type DesignTokens } from "@sugarcube-sh/dtcg";
import { setExtension, commit } from "@sugarcube-sh/dtcg-edit";

declare let tokens: DesignTokens;

const done = commit(
    tokens,
    setExtension(tokens, "space", ["com.example", "scale", "ratio"], 1.333),
);
if (done.tokens) tokens = done.tokens;
