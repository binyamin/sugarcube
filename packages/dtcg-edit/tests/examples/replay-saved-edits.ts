// Replays edits saved in a link onto files that may have changed since. The link can come from
// anyone, so what it holds is checked to be edits first. Each thing done goes back whole or not at
// all; one that no longer fits is reported as a clash, not forced.
import { type DesignTokens } from "@sugarcube-sh/dtcg";
import { createSession, isEdits } from "@sugarcube-sh/dtcg-edit";

declare const tokens: DesignTokens;

const saved: unknown = JSON.parse(decodeURIComponent(fromUrl));
if (!isEdits(saved)) throw new Error("the link doesn't hold edits");
const session = createSession(tokens);
for (const { parts } of session.restore(saved)) {
    for (const { path, file, yours, theirs } of parts) showClash(path ?? file, yours, theirs);
}
