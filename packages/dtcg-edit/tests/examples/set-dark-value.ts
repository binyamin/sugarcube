// Setting a color for the dark theme only. If more than one file could hold it, the person is asked
// which.
import { type DesignSystem } from "@sugarcube-sh/dtcg";
import { setValue, commit } from "@sugarcube-sh/dtcg-edit";

declare let ds: DesignSystem;
const dark = { theme: "dark" };

let done = commit(ds, setValue(ds, "color.danger", "#fca5a5", { context: dark }));

if ("decision" in done && done.decision.kind === "placement") {
    const file = await askPerson(done.decision.candidates);
    done = commit(ds, setValue(ds, "color.danger", "#fca5a5", { context: dark, place: file }));
}
if ("ds" in done) ds = done.ds;
else if ("refused" in done) showMessage(done.refused.reason);
else if ("conflicts" in done) showConflicts(done.conflicts);
