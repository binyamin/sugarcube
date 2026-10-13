// Lists what changed between two versions of the tokens: added, removed and changed, and in which
// themes.
import { diff, type DesignSystem } from "@sugarcube-sh/dtcg";

declare const before: DesignSystem;
declare const after: DesignSystem;

for (const change of diff(before, after)) {
    if (change.kind === "changed")
        row(
            change.path,
            change.in.map((i) => JSON.stringify(i)).join(", "),
            change.before,
            change.after,
        );
    if (change.kind === "added") row(`+ ${change.path}`);
    if (change.kind === "removed") row(`- ${change.path}`);
}
