import { resolve } from "node:path";
import { filePath, folderOf } from "../read/paths.js";

export function fileOnDisk(entry: string, file: string): string {
    return diskPath(filePath(folderOf(slashed(entry)), file));
}

export function diskPath(path: string): string {
    return slashed(resolve(slashed(path)));
}

export function slashed(path: string): string {
    return path.replaceAll("\\", "/");
}
