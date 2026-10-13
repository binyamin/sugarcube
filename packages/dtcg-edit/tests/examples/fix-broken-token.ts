// Shows a token whose value can't be read, with what's wrong, then fixes it.
import { type DesignSystem } from "@sugarcube-sh/dtcg";
import { setValue, commit } from "@sugarcube-sh/dtcg-edit";

declare let ds: DesignSystem;

const t = ds.permutation().token("color.brand");
if (t?.invalid) {
    showBroken(t.authored?.value, t.diagnostics);
    const done = commit(ds, setValue(ds, t.path, "#e11d48"));
    if ("ds" in done) ds = done.ds;
}
