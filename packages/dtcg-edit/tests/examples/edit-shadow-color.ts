// Changes only the color of a shadow, leaving the rest of it as written.
import { type DesignTokens } from "@sugarcube-sh/dtcg";
import { setValue } from "@sugarcube-sh/dtcg-edit";

declare const tokens: DesignTokens;

setValue(tokens, "shadow.card", "#00000055", { part: ["color"] });
