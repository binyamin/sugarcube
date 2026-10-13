// Replays edits saved in a link onto files that may have changed since. The link can come from
// anyone, so what it holds is checked to be edits first. An edit that no longer fits is reported,
// not forced.
import { type DesignTokens } from "@sugarcube-sh/dtcg";
import { apply, isEdits } from "@sugarcube-sh/dtcg-edit";

declare let tokens: DesignTokens;

const saved: unknown = JSON.parse(decodeURIComponent(fromUrl));
if (!isEdits(saved)) throw new Error("the link doesn't hold edits");
const result = apply(tokens, saved.ops);
if ("conflicts" in result) showConflicts(result.conflicts);
else tokens = result;
