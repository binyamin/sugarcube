// A code editor feature. Click a reference like `{color.brand}` to jump to that token, and get
// suggestions of tokens of the right type as you type one.
import { atOffset, type DesignTokens } from "@sugarcube-sh/dtcg";

declare const tokens: DesignTokens;

const hit = atOffset(tokens, "tokens.json", 214);
if (hit.kind === "reference") {
    const target = tokens.permutation(hit.permutation).token(hit.to);
    if (target) goTo(tokens.spanOf(target.valueFrom));
}

const here = atOffset(tokens, "tokens.json", 380);
const expects = here.kind === "reference" || here.kind === "token" ? here.expects : undefined;
export const options = tokens.permutation().tokens.filter((t) => !expects || t.type === expects);
