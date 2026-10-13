// Adds a theme built on dark, then gives it one color of its own.
import { type DesignSystem } from "@sugarcube-sh/dtcg";
import { addContext, setValue, commit } from "@sugarcube-sh/dtcg-edit";

declare let ds: DesignSystem;

let done = commit(ds, addContext(ds, "theme", "dim", { file: "dim.json", basedOn: "dark" }));
if (!("ds" in done)) throw new Error("could not add the dim theme");
ds = done.ds;

done = commit(ds, setValue(ds, "color.surface", "#2a2a2e", { context: { theme: "dim" } }));
if ("ds" in done) ds = done.ds;
