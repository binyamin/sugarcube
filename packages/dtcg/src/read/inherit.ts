import { parentOf } from "../path.js";
import type { Merged, MergedGroup, MergedTopLevel } from "./merge.js";
import { type Settings, settingsOf } from "./settings.js";
import type { Properties } from "./walk.js";

export type Inheritable = "type" | "deprecated";

export function inherited<K extends Inheritable>(
    item: Properties & { path: string },
    merged: Merged,
    property: K,
): Properties[K] {
    return item[property] ?? closest(item.path, merged, property);
}

export function applying(merged: Merged, group: MergedTopLevel | MergedGroup): Settings {
    const settings = settingsOf(merged, group);
    if (!("path" in group)) return settings;
    return {
        ...settings,
        type: atGroup(merged, "type", group.path),
        deprecated: atGroup(merged, "deprecated", group.path),
    };
}

function closest<K extends Inheritable>(path: string, merged: Merged, property: K): Properties[K] {
    return atGroup(merged, property, parentOf(path));
}

function atGroup<K extends Inheritable>(
    merged: Merged,
    property: K,
    group: string | undefined,
): Properties[K] {
    if (group === undefined) return merged.root[property];
    const known: Map<string, Properties[K]> = merged.inheritedAt[property];
    const found = known.get(group);
    if (found !== undefined || known.has(group)) return found;
    const each = merged.groups.get(group);
    const applies =
        (each && settingsOf(merged, each)[property]) ?? atGroup(merged, property, parentOf(group));
    known.set(group, applies);
    return applies;
}
