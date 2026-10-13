// Finds the scales in a design system: groups whose steps are made by a generator, and groups
// written out by hand whose tokens are all sizes.
import { type DesignSystem } from "@sugarcube-sh/dtcg";

declare const ds: DesignSystem;

for (const group of ds.permutation().groups) {
    if (group.extensions?.["com.example.scale"]) {
        row(group.path, "made by a generator");
        continue;
    }
    const { tokens } = group;
    if (tokens.length > 1 && tokens.every((t) => t.type === "dimension" && !t.generated)) {
        row(group.path, "written by hand");
    }
}
