// A code editor feature. Click a reference like `{color.brand}` to jump to that token, and get
// suggestions of tokens of the right type as you type one.
import { atOffset, type DesignSystem } from "@sugarcube-sh/dtcg";

declare const ds: DesignSystem;

const hit = atOffset(ds, "tokens.json", 214);
if (hit.kind === "reference") {
    const target = ds.permutation(hit.permutation).token(hit.to);
    if (target) goTo(target.valueFrom.span);
}

const here = atOffset(ds, "tokens.json", 380);
const expects = here.kind === "reference" || here.kind === "token" ? here.expects : undefined;
export const options = ds.permutation().tokens.filter((t) => !expects || t.type === expects);
