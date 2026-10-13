// Changes only the color of a shadow, leaving the rest of it as written.
import { type DesignSystem } from "@sugarcube-sh/dtcg";
import { setValue } from "@sugarcube-sh/dtcg-edit";

declare const ds: DesignSystem;

setValue(ds, "shadow.card", "#00000055", { part: ["color"] });
