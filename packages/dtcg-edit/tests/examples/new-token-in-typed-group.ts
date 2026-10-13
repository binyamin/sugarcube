// Adds a token to a group that already declares a type, so the new token doesn't repeat it.
import { type DesignSystem } from "@sugarcube-sh/dtcg";
import { create, commit } from "@sugarcube-sh/dtcg-edit";

declare let ds: DesignSystem;

const colors = ds.permutation().group("color");
const done = commit(ds, create(ds, "color.info", { $value: "#0ea5e9" }));
if ("ds" in done) ds = done.ds;
if (!colors?.type) showMessage("This group has no type; choose one");
