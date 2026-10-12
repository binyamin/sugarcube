import { parentOf } from "../path.js";
import type { Merged, MergedGroup } from "./merge.js";
import { type Settings, settingsOf } from "./settings.js";
import type { Properties } from "./walk.js";

type Inheritable = "type" | "deprecated";

const remembered = new WeakMap<Merged, { [K in Inheritable]: Map<string, Properties[K]> }>();

export function inherited<K extends Inheritable>(
    item: Properties & { path: string },
    merged: Merged,
    property: K,
): Properties[K] {
    return item[property] ?? closest(item.path, merged, property);
}

export function applying(merged: Merged, group: MergedGroup): Settings {
    const settings = settingsOf(merged, group);
    return {
        ...settings,
        type: settings.type ?? closest(group.path, merged, "type"),
        deprecated: settings.deprecated ?? closest(group.path, merged, "deprecated"),
    };
}

function closest<K extends Inheritable>(path: string, merged: Merged, property: K): Properties[K] {
    const caches = remembered.get(merged) ?? { type: new Map(), deprecated: new Map() };
    remembered.set(merged, caches);
    const cache: Map<string, Properties[K]> = caches[property];

    const fromGroup = (group: string | undefined): Properties[K] => {
        if (group === undefined) return merged.root[property];
        if (cache.has(group)) return cache.get(group);
        const each = merged.groups.get(group);
        const found = (each && settingsOf(merged, each)[property]) ?? fromGroup(parentOf(group));
        cache.set(group, found);
        return found;
    };
    return fromGroup(parentOf(path));
}
