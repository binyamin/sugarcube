// A script that rewrites every color written as a hex string into the spec's object form, as one
// step, using the fix offered for each one.
import { type DesignSystem } from "@sugarcube-sh/dtcg";
import { commit, fix, fixesFor } from "@sugarcube-sh/dtcg-edit";

declare let ds: DesignSystem;

const fixes = ds.diagnostics
    .filter((d) => d.kind === "hex-string-color")
    .flatMap((d) => fixesFor(ds, d).filter((f) => f.safe));

const done = commit(ds, fix(ds, fixes));
if ("ds" in done) ds = done.ds;
else if ("refused" in done) showMessage(done.refused.reason);
