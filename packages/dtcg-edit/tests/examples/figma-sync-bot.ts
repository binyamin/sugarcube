// A bot that syncs one changed variable from Figma. It opens a pull request with just that change,
// and lists the other themes it also shows in.
import { setValue, changedFiles } from "@sugarcube-sh/dtcg-edit";
import { type DesignSystem } from "@sugarcube-sh/dtcg";

declare const ds: DesignSystem;

const result = setValue(ds, "color.primary.600", figmaValue, { context: { theme: "dark" } });

if ("ops" in result) {
    const changes = changedFiles(ds, result.ops);
    if (!("conflicts" in changes)) {
        const also = result.alsoAffects.map((input) => ds.permutation(input).label);
        await openPullRequest(changes, {
            title: "Figma: color.primary.600 in dark",
            body: `Also shows in: ${also.join(", ") || "nothing else"}`,
        });
    }
} else if ("decision" in result) {
    await commentOnFigma(`Needs a person: ${result.decision.kind}`);
} else {
    await commentOnFigma(result.refused.reason);
}
