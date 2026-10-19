import type { BuildAdapter } from "../controllers/adapter";
import type { SentAdapter } from "../protocol";
import { plain } from "./plain";
import { sugarcube } from "./sugarcube";

export function adapterFor(sent: SentAdapter): BuildAdapter {
    return sent.name === "sugarcube" ? sugarcube(sent.settings) : plain(sent.settings);
}
