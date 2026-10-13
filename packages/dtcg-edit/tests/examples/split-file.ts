// Moves the semantic colors out of `colors.json` into a new `semantic.json`. Their names don't
// change.
import { type DesignSystem } from "@sugarcube-sh/dtcg";
import { addFile, move, commit } from "@sugarcube-sh/dtcg-edit";

declare let ds: DesignSystem;

let done = commit(ds, addFile(ds, "semantic.json", { to: { set: "base" }, after: "colors.json" }));
if ("ds" in done) ds = done.ds;

for (const path of ["color.danger", "color.success", "color.warning"]) {
    done = commit(ds, move(ds, path, { file: "semantic.json" }));
    if ("ds" in done) ds = done.ds;
    else if ("refused" in done) showMessage(done.refused.reason);
}
