import { SetGetStyleFunc, CSSProperty, EventSource, EventEmitterMap, Handler, EventHandlerMap } from "./types";
import { toEventEmitter } from "./emitter"

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

const eventsProxyDefinition: ProxyHandler<EventSource<any, any>> = {
    get: (object, key: string) => {
        return toEventEmitter(object, key);
    }
}

export function createEventsProxy<Map>(
    source: EventSource<any, keyof Map>,
    initialListeners?: EventHandlerMap<Map>
): EventEmitterMap<Map> {
    const proxy = new Proxy(source, eventsProxyDefinition) as unknown as EventEmitterMap<Map>;
    if (initialListeners) {
        Object.entries(initialListeners)
            .forEach(([name, handler]) => toEventEmitter(source, name as keyof Map).apply(handler as Handler<any>));
    }
    return proxy;
}
