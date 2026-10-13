// Changes only the font weight of a typography token, leaving its other four properties as written.
import { type DesignSystem } from "@sugarcube-sh/dtcg";
import { setValue, commit } from "@sugarcube-sh/dtcg-edit";

declare let ds: DesignSystem;

const done = commit(ds, setValue(ds, "type.heading", 700, { part: ["fontWeight"] }));
if ("ds" in done) ds = done.ds;
if ("refused" in done) showMessage(done.refused.reason);
