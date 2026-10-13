// A migration prompt. It counts colors written as plain hex strings, which the latest DTCG spec no
// longer allows, and suggests converting them.
import { type DesignSystem } from "@sugarcube-sh/dtcg";

declare const ds: DesignSystem;

const hex = ds.diagnostics.filter((d) => d.kind === "hex-string-color");
if (hex.length) {
    showMessage(
        `${hex.length} colours are plain hex strings, which DTCG 2025.10 no longer allows.\n  Run \`npx [tool-name] migrate\` to convert them. Your CSS output will not change.`,
    );
}
