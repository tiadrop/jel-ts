import { DOMContent, ElementDescriptor, JelEntity } from "./types";

export const entityDataSymbol = Symbol("jelComponentData");

export const isContent = (value: DOMContent | ElementDescriptor<string> | undefined): value is DOMContent => {
    if (value === undefined) return false;
    return typeof value == "string"
    || typeof value == "number"
    || !value
    || value instanceof Element
    || value instanceof Text
    || entityDataSymbol in value
    || (Array.isArray(value) && value.every(isContent));
};

export function isJelEntity(content: DOMContent): content is JelEntity<object> {
    return typeof content == "object" && !!content && entityDataSymbol in content;
}

/**
 * Wraps an object such that it can be appended as DOM content while retaining its original API
 * @param content 
 * @param api 
 */
export function createEntity<
    API extends object
>(content: DOMContent, api: API extends DOMContent ? never : API): JelEntity<API>
export function createEntity(content: DOMContent): JelEntity<void>
export function createEntity<
    API extends Record<string | symbol, any> | undefined
>(content: DOMContent, api?: API) {
    if (isContent(api as any)) {
        throw new TypeError("API object is already valid content")
    }
    return Object.create(api ?? {}, {
        [entityDataSymbol]: {
            value: {
                dom: content
            }
        },
    }) as JelEntity<API>;
};
