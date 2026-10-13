// Removes a whole group, after first showing which references that would break.
import { type DesignSystem } from "@sugarcube-sh/dtcg";
import { remove, commit } from "@sugarcube-sh/dtcg-edit";

declare let ds: DesignSystem;

const result = remove(ds, "color.legacy");
if ("ops" in result && result.broken?.length) {
    showMessage(`Removing color.legacy breaks: ${result.broken.join(", ")}`);
}
const done = commit(ds, result);
if ("ds" in done) ds = done.ds;
