export type ElementClassSpec = string | Record<string, boolean> | ElementClassSpec[];
export type DOMContent = number | null | string | Element | JelEntity<object, any> | Text | DOMContent[];
export type DomEntity<T extends HTMLElement> = JelEntity<ElementAPI<T>, HTMLElementEventMap>;

type JelConstructor<Spec, API, EventDataMap> = (
    spec?: Partial<Spec & CommonOptions<EventDataMap>>
) => JelEntity<API, EventDataMap>;

type CommonOptions<EventDataMap> = {
    on?: Partial<{
        [EventID in keyof EventDataMap]: (data: EventDataMap[EventID]) => void;
    }>
}

type JelEntity<API, EventDataMap> = API & {
    on<E extends keyof EventDataMap>(
        eventId: E, handler: (
            this: JelEntity<API, EventDataMap>, data: EventDataMap[E]
        ) => void
    ): void;
    readonly [componentDataSymbol]: JelComponentData;
};

type Styles = Partial<{
    [key in keyof CSSStyleDeclaration]: string | number
}> & Record<`--${string}`, string | number>;

interface ElementDescriptor {
    classes?: ElementClassSpec;
    content?: DOMContent;
    attribs?: Record<string, string | number | boolean>;
    on?: Partial<{[E in keyof HTMLElementEventMap]: (
        event: HTMLElementEventMap[E]
    ) => void}>;
    style?: Styles;
}

// type of `$`, describing $.TAG(...), $(element) and $("tag#id.class")
type DomHelper = (
    (
        <T extends keyof HTMLElementTagNameMap>(
            tagName: T,
            descriptor: ElementDescriptor
        ) => DomEntity<HTMLElementTagNameMap[T]>
    )
    & (
        <T extends keyof HTMLElementTagNameMap>(
            selector: `${T}#${string}`,
            content?: DOMContent
        ) => DomEntity<HTMLElementTagNameMap[T]>
    )
    & (
        <T extends keyof HTMLElementTagNameMap>(
            selector: `${T}.${string}`,
            content?: DOMContent
        ) => DomEntity<HTMLElementTagNameMap[T]>
    )
    & (
        <T extends keyof HTMLElementTagNameMap>(
            selector: T,
            content?: DOMContent
        ) => DomEntity<HTMLElementTagNameMap[T]>
    )
    & (<T extends HTMLElement>(element: T) => DomEntity<T>)
    & {
        [T in keyof HTMLElementTagNameMap]: (
            descriptor: ElementDescriptor
        ) => DomEntity<HTMLElementTagNameMap[T]>
    }
    & {
        [T in keyof HTMLElementTagNameMap]: (
            content?: DOMContent
        ) => DomEntity<HTMLElementTagNameMap[T]>
    }
)

type JelComponentData = {
    dom: DOMContent;
}

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

type OptionalKeys<T> = {
    [K in keyof T]-?: {} extends Pick<T, K> ? K : never
}[keyof T];

type Optionals<T> = {
    [K in OptionalKeys<T>]-?: Exclude<T[K], undefined>;
}

function createElement<Tag extends keyof HTMLElementTagNameMap>(
    tag: Tag, descriptor: ElementDescriptor | DOMContent = {}
): DomEntity<HTMLElementTagNameMap[Tag]> {
    if (isContent(descriptor)) descriptor = {content: descriptor};

    const ent = getWrappedElement(document.createElement(tag));

    const applyClasses = (classes: ElementClassSpec): void => {
        if (Array.isArray(classes)) {
            return classes.forEach(c => applyClasses(c));
        }
        if (typeof classes == "string") {
            classes.trim().split(/\s+/).forEach(c => ent.classes.add(c));
            return;
        }
        Object.entries(classes).forEach(([className, state]) => {
            if (state) applyClasses(className);
        });
    };

    applyClasses(descriptor.classes || []);

    if (descriptor.attribs) {
        Object.entries(descriptor.attribs).forEach(([k, v]) => {
            if (v === false) {
                return;
            }
            ent.element.setAttribute(k, v === true ? k : v as string);
        });
    }

    if (descriptor.content !== undefined) recursiveAppend(ent.element, descriptor.content);

    if (descriptor.style) {
        Object.entries(descriptor.style).forEach(([prop, val]) => {
            if (/\-/.test(prop)) {
                ent.element.style.setProperty(prop, (val as any).toString());
            } else {
                (ent.element.style as any)[prop] = val;
            }
        });
    }

    if (descriptor.on) {
        Object.entries(descriptor.on).forEach(
            ([eventName, handler]) => ent.on(eventName as any, handler as any)
        );
    }

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
    apply(create, _, [selectorOrTagName, contentOrDescriptor]: [string | HTMLElement, DOMContent | ElementDescriptor | undefined]) {

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
const attribsProxy: ProxyHandler<HTMLElement> = {
    get: (element, key: string) => {
        return element.getAttribute(key);
    },
    set: (element, key: string, value) => {
        element.setAttribute(key, value);
        return true;
    }
};

const recursiveAppend = (parent: HTMLElement, c: DOMContent) => {
    if (c === null) return;
    if (Array.isArray(c)) {
        c.forEach(item => recursiveAppend(parent, item));
        return;
    }
    if (isJelEntity(c)) {
        recursiveAppend(parent, c[componentDataSymbol].dom);
        return;
    }
    if (typeof c == "number") c = c.toString();
    parent.append(c);
};

function getWrappedElement<T extends HTMLElement>(element: T) {
    if (!elementWrapCache.has(element)) {
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
                recursiveAppend(element, content);
            },
            remove(){
                element.remove();
            },
            classes: element.classList,
            qsa(selector: string) {
                return [].slice.call(element.querySelectorAll(selector)).map(
                    (el: HTMLElement) => getWrappedElement(el)
                );
            },
            get content() {
                return [].slice.call(element.children).map((child: Element) => {
                    if (child instanceof HTMLElement) return getWrappedElement(child);
                    return child;
                }) as DOMContent;
            },
            set content(v: DOMContent) {
                element.innerHTML = "";
                recursiveAppend(element, v);
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
        };
        elementWrapCache.set(element, domEntity);
    }
    return elementWrapCache.get(element) as DomEntity<T>;
}

function isJelEntity(content: DOMContent): content is JelEntity<object | void, any> {
    return typeof content == "object" && !!content && componentDataSymbol in content;
}

type Reserve<T> = Record<string, any> & Partial<Record<keyof T, never>>;

export function definePart<
    Spec extends Reserve<CommonOptions<any>>,
    API extends Reserve<JelEntity<void, any>> | void = void,
    EventDataMap extends Record<string, any> = {}
>(
    defaultOptions: Optionals<Spec>,
    init: (
        spec: Required<Spec>,
        append: (content: DOMContent) => void,
        trigger: <K extends keyof EventDataMap>(eventId: K, eventData: EventDataMap[K]) => void,
    ) => API
) {
    return ((spec: Spec) => {
        const fullSpec = {
            ...defaultOptions, ...spec,
        } as Required<Spec> & CommonOptions<JelEntity<API, EventDataMap>>;

        const eventHandlers: Partial<{
            [EventID in keyof EventDataMap]: ((data: EventDataMap[EventID]) => void)[];
        }> = {};

        const addEventListener = <E extends keyof EventDataMap>(eventId: E, fn: (data: EventDataMap[E]) => void) => {
            if (!eventHandlers[eventId]) eventHandlers[eventId] = [];
            eventHandlers[eventId].push(fn);
        };

        if (fullSpec.on) Object.entries(fullSpec.on).forEach(([eventId, handler]) => {
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

        const api = init(fullSpec, append, trigger);

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
