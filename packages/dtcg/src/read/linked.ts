import type { Group, Permutation, Token } from "../index.js";

const paths = (items: (Token | Group)[]) => items.map(({ path }) => path);

const tokenShared = {
    kind: "token",
    toJSON(this: Token) {
        return { ...this, group: undefined };
    },
};

const groupShared = {
    kind: "group",
    toJSON(this: Group) {
        return {
            ...this,
            group: undefined,
            rootToken: undefined,
            children: paths(this.children),
        };
    },
};

const permutationShared = {
    toJSON(this: Permutation) {
        return { ...this, children: paths(this.children) };
    },
};

export function linkedToken(fields: Omit<Token, "kind">): Token {
    return Object.assign(Object.create(tokenShared), fields);
}

export function linkedGroup(fields: Omit<Group, "kind">): Group {
    return Object.assign(Object.create(groupShared), fields);
}

export function linkedPermutation(fields: Permutation): Permutation {
    return Object.assign(Object.create(permutationShared), fields);
}
