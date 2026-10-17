// A code editor striking through references to deprecated tokens, with the reason.
import type { DesignTokens } from "@sugarcube-sh/dtcg";

declare const tokens: DesignTokens;

for (const d of tokens.diagnostics) {
    if (d.kind === "deprecated-reference" && d.tags?.includes("deprecated") && d.span) {
        report(
            d.span,
            `${d.detail.ref} is deprecated${d.detail.reason ? `: ${d.detail.reason}` : ""}`,
        );
    }
}
