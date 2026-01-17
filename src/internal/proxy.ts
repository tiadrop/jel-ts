import { SetGetStyleFunc, CSSProperty } from "./types";
import { EventEmitter, toEventEmitter } from "./emitter"

export const styleProxy: ProxyHandler<SetGetStyleFunc> = {
    get(style, prop: CSSProperty){
        return style(prop);
    },
    set(style, prop: CSSProperty, value) {
        style(prop, value);
        return true;
    },
    apply(style, _, [stylesOrProp, value]: [
        CSSProperty,
        any
    ]) {
        if (typeof stylesOrProp == "object") {
            Object.entries(stylesOrProp).forEach(
                ([prop, val]) => style(prop as CSSProperty, val as string)
            );
            return;
        }
        style(stylesOrProp, value);
    },
    deleteProperty(style, prop: CSSProperty & string) {
        style(prop, null);
        return true;
    }
};

export const attribsProxy: ProxyHandler<HTMLElement> = {
    get: (element, key: string) => {
        return element.getAttribute(key);
    },
    set: (element, key: string, value) => {
        element.setAttribute(key, value);
        return true;
    },
    has: (element, key: string) => {
        return element.hasAttribute(key);
    },
    ownKeys: (element) => {
        return element.getAttributeNames();
    },
};

export const eventsProxy: ProxyHandler<HTMLElement> = {
    get: (element, key: keyof HTMLElementEventMap | "addEventListener" | "removeEventListener") => {
        if (key == "addEventListener") {
            return (
                name: string,
                handler: (ev: Event) => void
            ) => element.addEventListener(name, handler);
        }
        if (key == "removeEventListener") {
            return (
                name: string,
                handler: (ev: Event) => void
            ) => element.removeEventListener(name, handler);
        }

        return toEventEmitter(element, key);
    }
}