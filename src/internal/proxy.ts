import { StylesDescriptor } from "./types";
import { EventEmitter } from "./emitter"

export const styleProxy: ProxyHandler<() => CSSStyleDeclaration> = {
    get(getStyle, prop){
        return getStyle()[prop as any];
    },
    set(getStyle, prop, value) {
        getStyle()[prop as any] = value;
        return true;
    },
    apply(getStyle, _, [stylesOrProp, value]: [
        Record<string, any> | keyof StylesDescriptor,
        any
    ]) {
        const style = getStyle();
        if (typeof stylesOrProp == "object") {
            Object.entries(stylesOrProp).forEach((
                [prop, val]) => style[prop as any] = val
            );
            return;
        }
        style[stylesOrProp] = value;
    },
    deleteProperty(getStyle, prop: keyof StylesDescriptor & string) {
        getStyle()[prop] = null as any;
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

        const listen = (handler: (e: Event) => void) => {
            const wrappedHandler = (event: Event) => handler(event);
            element.addEventListener(key, wrappedHandler);
            return () => {
                element.removeEventListener(key, wrappedHandler);
            }
        };
        return new EventEmitter(listen);
    }
}