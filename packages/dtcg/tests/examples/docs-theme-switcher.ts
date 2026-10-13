// A theme switcher on a docs site. It shows every color in whichever theme the reader picks,
// falling back to the default.
import { type DesignSystem } from "@sugarcube-sh/dtcg";

declare const ds: DesignSystem;
declare const picked: string;

const theme = ds.modifier("theme");
const themes = theme?.contexts.map(({ name }) => name) ?? [];
const current = ds.permutation({
    theme: themes.includes(picked) ? picked : (theme?.default ?? ""),
});
for (const t of current?.tokens ?? []) {
    if (t.type === "color") row(t.path, t.resolved?.hex);
}
