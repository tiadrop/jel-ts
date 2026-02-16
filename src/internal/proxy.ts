import { SetGetStyleFunc, CSSProperty, EventSource } from "./types";
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

export type EventsProxy<Map> = {
    [K in keyof Map]: EventEmitter<Map[K]>;
} & {
    addEventListener<K extends keyof Map>(
        eventName: K, 
        listener: (event: Map[K]) => void
    ): void;
    removeEventListener<K extends keyof Map>(
        eventName: K, 
        listener: (event: Map[K]) => void
    ): void;
};

const eventsProxyDefinition: ProxyHandler<EventSource<any, any>> = {
    get: (element, key: string) => {
        return toEventEmitter(element, key);
    }
}

export const createEventsProxy = <Map>(source: EventSource<any, keyof Map>) => new Proxy(source, eventsProxyDefinition) as unknown as EventsProxy<Map>;
