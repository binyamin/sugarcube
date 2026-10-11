export const fixTitles = {
    useSimilar: (name: string) => `use \`${name}\`, which has a similar name`,
    deleteEarlier: (key: string) => `delete the earlier \`${key}\`, which is never used`,
    writePointer: (pointer: string) => `write it as \`${pointer}\``,
    deleteType: "delete this `$type`, so the token takes its group's type",
    extendsAsReference: (reference: string) => `write it as the reference \`${reference}\``,
    hexToObject: "write the color as an object, keeping the hex",
    measureAsObject: (type: string) => `write the ${type} as an object`,
    fullHex: (hex: string) =>
        `write the hex with ${hex.length === 9 ? "eight" : "six"} digits, \`${hex}\``,
    referenceAsPointer: (pointer: string) =>
        `write it as the pointer \`${pointer}\`, which can stand for part of a value`,
};

export const conflictReasons = {
    notInProject: (file: string) => `\`${file}\` is not one of the project's files`,
    gone: (place: string) => `${place} is no longer there`,
    changedSince: (place: string) => `${place} has changed since the edit was made`,
    alreadyThere: (place: string) => `${place} already holds something else`,
    notAGroup: (place: string) => `${place} runs through something that is not a group`,
    nameTaken: (place: string, name: string) =>
        `${place} can't be renamed: a sibling is already called \`${name}\``,
    fileExists: (file: string) => `\`${file}\` already exists and holds something else`,
    fileChanged: (file: string) => `\`${file}\` has changed since the edit was made`,
    unread: (file: string) => `nothing in the project reads \`${file}\`, so it would be lost`,
};
