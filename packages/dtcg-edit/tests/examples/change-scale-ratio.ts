// Changes a spacing scale's ratio. The steps are remade from the new ratio when the tokens are read
// again.
import { type DesignSystem } from "@sugarcube-sh/dtcg";
import { setExtension, commit } from "@sugarcube-sh/dtcg-edit";

declare let ds: DesignSystem;

const done = commit(ds, setExtension(ds, "space", ["sh.sugarcube", "scale", "ratio"], 1.333));
if ("ds" in done) ds = done.ds;
