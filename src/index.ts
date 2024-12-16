export type ElementClassSpec = string | Record<string, boolean> | ElementClassSpec[];
export type DOMContent = number | null | string | Element | JelEntity<object, any> | Text | DOMContent[];
export type DomEntity<T extends HTMLElement> = JelEntity<ElementAPI<T>, HTMLElementEventMap>;

type JelConstructor<Spec, API, EventDataMap> = (spec?: Partial<Spec & CommonOptions<EventDataMap>>) => JelEntity<API, EventDataMap>;

type CommonOptions<EventDataMap> = {
    on?: Partial<{
        [EventID in keyof EventDataMap]: (data: EventDataMap[EventID]) => void;
    }>
}

type JelEntity<API, EventDataMap> = API & {
    on<E extends keyof EventDataMap>(eventId: E, handler: (this: JelEntity<API, EventDataMap>, data: EventDataMap[E]) => void): void;
    readonly [componentDataSymbol]: JelComponentData;
};

interface ElementDescriptor {
    classes?: ElementClassSpec;
    content?: DOMContent;
    attribs?: Record<string, string | number | boolean>;
    on?: Partial<{[E in keyof HTMLElementEventMap]: (event: HTMLElementEventMap[E]) => void}>;
    style?: Partial<{[key in keyof CSSStyleDeclaration]: string | number}> & Record<string, string | number>;
}

type HelperSelectorString<T extends string> = T | `${T}${"#"|"."}${any}`;

// type of `$`, describing $.TAG(...), $(element) and $("tag#id.class")
type DomHelper = (
    (<T extends keyof HTMLElementTagNameMap>(tagName: T, descriptor: ElementDescriptor) => DomEntity<HTMLElementTagNameMap[T]>)
    & (
        <T extends keyof HTMLElementTagNameMap>(
            selector: HelperSelectorString<T>,
            // ^ still not perfect; infers T from "tag#id" and "tag.class.class" but not "tag#id.class"
            content?: DOMContent
        ) => DomEntity<HTMLElementTagNameMap[T]>
    )
    & ((selector: string, content?: DOMContent) => DomEntity<any>)
    & (<T extends HTMLElement>(element: T) => DomEntity<T>)
    & {[T in keyof HTMLElementTagNameMap]: (descriptor: ElementDescriptor) => DomEntity<HTMLElementTagNameMap[T]>}
    & {[T in keyof HTMLElementTagNameMap]: (content?: DOMContent) => DomEntity<HTMLElementTagNameMap[T]>}
)

type JelComponentData = {
    dom: DOMContent;
}

function createElement<Tag extends keyof HTMLElementTagNameMap>(
    tag: Tag, descriptor: ElementDescriptor | DOMContent = {}
): DomEntity<HTMLElementTagNameMap[Tag]> {
    if (isContent(descriptor)) descriptor = {content: descriptor};

    const ent = getWrappedElement(document.createElement(tag));

    const applyClasses = (classes: ElementClassSpec): void => {
        if (Array.isArray(classes)) return classes.forEach((c) => applyClasses(c));
        if (typeof classes == "string") {
            (classes as string).trim().split(/\s+/).forEach((c) => ent.classes.add(c));
            return;
        }
        Object.entries(classes).forEach(([className, state]) => {
            if (state) applyClasses(className);
        });
    };

    applyClasses(descriptor.classes || []);

    if (descriptor.attribs) Object.entries(descriptor.attribs).forEach(([k, v]) => {
        if (v === false) {
            return;
        }
        ent.element.setAttribute(k, v === true ? k : v as string);
    });
    
    const addContent = (content?: DOMContent): void => {
        if (Array.isArray(content)) return content.forEach((c) => addContent(c));
        if (content) ent.append(content as any);
    };

    if (descriptor.content) addContent(descriptor.content);

    descriptor.style && Object.entries(descriptor.style).forEach(([prop, val]) => {
        if (/\-/.test(prop)) {
            ent.element.style.setProperty(prop, (val as any).toString());
        } else {
            (ent.element.style as any)[prop] = val;
        }
    });
    descriptor.on && Object.entries(descriptor.on).forEach(
        ([eventName, handler]) => ent.on(eventName as any, handler as any)
    );
    return ent;
};

const isContent = (value: DOMContent | ElementDescriptor | undefined): value is DOMContent => {
    return ["string", "number"].includes(typeof value) 
    || value instanceof Element
    || value instanceof Text
    || Array.isArray(value)
    || !value;
};

export const $ = new Proxy(createElement, {
    apply(create, _0, [selectorOrTagName, contentOrDescriptor]: [string | HTMLElement, DOMContent | ElementDescriptor | undefined]) {

        if (selectorOrTagName instanceof HTMLElement) return getWrappedElement(selectorOrTagName);

        const tagName = selectorOrTagName.match(/^[^.#]*/)?.[0] || "";
        if (!tagName) throw new Error("Invalid tag");
        const matches = selectorOrTagName.slice(tagName.length).match(/[.#][^.#]+/g);
        const classes = {} as Record<string, boolean>;
        const descriptor = {
            classes,
            content: contentOrDescriptor,
        } as ElementDescriptor;
        matches?.forEach((m) => {
            const value = m.slice(1);
            if (m[0] == ".") {
                classes[value] = true;
            } else {
                descriptor.attribs = {id: value};
            }
        });
        return create(tagName as any, descriptor);
    },
    get(create, tagName: keyof HTMLElementTagNameMap) {
        return (descriptorOrContent: ElementDescriptor | DOMContent) => {
            return create(tagName, descriptorOrContent);
        };
    }
}) as DomHelper;    

const componentDataSymbol = Symbol("jelComponentData");

const elementWrapCache = new WeakMap<HTMLElement, DomEntity<any>>();

type ElementAPI<T extends HTMLElement> = {
    readonly element: T;
    content: DOMContent;
    classes: DOMTokenList;
    attribs: {
        [key: string]: string | null;
    },
    style: CSSStyleDeclaration;
    innerHTML: string;
    qsa(selector: string): DomEntity<any>[];
    append(...content: DOMContent[]): void;
    remove(): void;
}

export function definePart<Spec, API extends object | void, EventDataMap extends Record<string, any> = {}>(
    defaultOptions: Spec,
    init: (
        spec: Spec,
        append: (content: DOMContent) => void,
        trigger: <K extends keyof EventDataMap>(eventId: K, eventData: EventDataMap[K]) => void,
    ) => API
) {
    return ((partialSpec: Partial<Spec> = {}) => {
        const spec = {
            ...defaultOptions, ...partialSpec,
        } as Spec & CommonOptions<JelEntity<API, EventDataMap>>;

        const eventHandlers: Partial<{
            [EventID in keyof EventDataMap]: ((data: EventDataMap[EventID]) => void)[];
        }> = {};

        const addEventListener = <E extends keyof EventDataMap>(eventId: E, fn: (data: EventDataMap[E]) => void) => {
            if (!eventHandlers[eventId]) eventHandlers[eventId] = [];
            eventHandlers[eventId].push(fn);
        };

        if (spec.on) Object.entries(spec.on).forEach(([eventId, handler]) => {
            addEventListener(eventId, handler as any);
        });

        let entity: JelEntity<API, EventDataMap>;

        const content: DOMContent[] = [];
        const append = (c: DOMContent) => {
            if (entity) throw new Error("Component root content can only be added during initialisation");
            content.push(c)
        };

        const trigger = <E extends keyof EventDataMap>(eventId: E, data: EventDataMap[E]) => {
            eventHandlers[eventId]?.forEach(fn => fn.call(entity, data));
        };

        const api = init(spec, append, trigger);

        entity = api ? Object.create(api, {
            [componentDataSymbol]: {
                value: {
                    dom: content
                }
            },
            on: {
                value: addEventListener,
            }
        }) : {
            [componentDataSymbol]: {
                dom: content,
            },
            on: addEventListener,
        };

        return entity;

    }) as JelConstructor<Spec, API, EventDataMap>;
};

const attribsProxy: ProxyHandler<HTMLElement> = {
    get: (element, key: string) => {
        return element.getAttribute(key);
    },
    set: (element, key: string, value) => {
        element.setAttribute(key, value);
        return true;
    }
};

function getWrappedElement<T extends HTMLElement>(element: T) {
    if (!elementWrapCache.has(element)) {

        const recursiveAppend = (c: DOMContent) => {
            if (c === undefined) debugger;
            if (c === null) return;
            if (Array.isArray(c)) {
                c.forEach(item => recursiveAppend(item));
                return;
            }
            if (isJelEntity(c)) {
                recursiveAppend(c[componentDataSymbol].dom);
                return;
            }
            if (typeof c == "number") c = c.toString();
            element.append(c);
        };

        const domEntity = {
            [componentDataSymbol]: {
                dom: element,
            },
            get element(){ return element },
            on: <E extends keyof HTMLElementEventMap>(
                eventId: E,
                handler: (data: HTMLElementEventMap[E]) => void,
            ) => {
                element.addEventListener(eventId, eventData => {
                    handler.call(domEntity, eventData);
                });
            },
            append(...content: DOMContent[]) {
                recursiveAppend(content);
            },
            remove(){
                element.remove();
            },
            classes: element.classList,
            qsa(selector: string) {
                return [].slice.call(element.querySelectorAll(selector)).map((el: HTMLElement) => getWrappedElement(el));
            },
            get content() {
                return [].slice.call(element.children).map((child: Element) => {
                    if (child instanceof HTMLElement) return getWrappedElement(child as HTMLElement);
                    return child;
                }) as DOMContent;
            },
            set content(v: DOMContent) {
                element.innerHTML = "";
                recursiveAppend(v);
            },
            attribs: new Proxy(element, attribsProxy) as unknown as {
                [key: string]: string | null;
            },
            get innerHTML() {
                return element.innerHTML;
            },
            set innerHTML(v) {
                element.innerHTML = v;
            },
            style: element.style,
        } as DomEntity<T>;
        elementWrapCache.set(element, domEntity);
    }
    return elementWrapCache.get(element) as DomEntity<T>;
}

function isJelEntity(content: DOMContent): content is JelEntity<object | void, any> {
    return typeof content == "object" && !!content && componentDataSymbol in content;
}
