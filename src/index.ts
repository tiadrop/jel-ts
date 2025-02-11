export type ElementClassDescriptor = string | Record<string, boolean> | ElementClassDescriptor[];
export type DOMContent = number | null | string | Element | JelEntity<object> | Text | DOMContent[];
export type DomEntity<T extends HTMLElement> = JelEntity<ElementAPI<T>>;

type PartConstructor<Spec, API extends object | void, EventDataMap> = (
    spec: Spec & EventSpec<EventDataMap>
) => JelEntity<EventHost<API, EventDataMap>>;

type EventSpec<EventDataMap> = EventDataMap extends object ? {
    on?: {
        [EventID in keyof EventDataMap]+?: (data: EventDataMap[EventID]) => void;
    }
} : {};

type JelEntity<API extends object | void> = (API extends void ? {} : API) & {
    readonly [entityDataSymbol]: JelEntityData;
};

type CSSValue = string | number | null;

type StylesDescriptor = {
    [K in keyof CSSStyleDeclaration as [
        K,
        CSSStyleDeclaration[K]
    ] extends [string, string] ? K : never]+?: CSSValue
}

type StyleAccessor = StylesDescriptor
& ((styles: StylesDescriptor) => void)
& ((property: keyof StylesDescriptor, value: CSSValue) => void);

type ContentlessTag = "area" | "br" | "hr" | "iframe" | "input"
| "textarea" | "img" | "canvas" | "link" | "meta";
type TagWithHref = "a" | "link";
type TagWithSrc = "img" | "script" | "iframe" | "video" | "audio";
type TagWithValue = "input" | "textarea";
type ContentlessElement = HTMLElementTagNameMap[ContentlessTag];

type ElementDescriptor<Tag extends string> = {
    classes?: ElementClassDescriptor;
    attribs?: Record<string, string | number | boolean>;
    on?: {[E in keyof HTMLElementEventMap]+?: (
        event: HTMLElementEventMap[E]
    ) => void};
    style?: StylesDescriptor;
    cssVariables?: Record<string, CSSValue>;
} & (Tag extends TagWithValue ? {
    value?: string | number;
} : {}) & (Tag extends ContentlessTag ? {} : {
    content?: DOMContent;
}) & (Tag extends TagWithSrc ? {
    src?: string;
} : {}) & (Tag extends TagWithHref ? {
    href?: string;
} : {});

type ElementAPI<T extends HTMLElement> = EventHost<{
    readonly element: T;
    classes: DOMTokenList;
    attribs: {
        [key: string]: string | null;
    },
    style: StyleAccessor;
    setCSSVariable(table: Record<string, CSSValue>): void;
    setCSSVariable(variableName: string, value: CSSValue): void;
    qsa(selector: string): (Element | DomEntity<HTMLElement>)[];
    remove(): void;
    getRect(): DOMRect;
    focus(): void;
    blur(): void;
} & (
    T extends ContentlessElement ? {} : {
        append(...content: DOMContent[]): void;
        innerHTML: string;
        content: DOMContent;
    }
) & (
    T extends HTMLElementTagNameMap[TagWithValue] ? {
        value: string;
        select(): void;
    } : {}
) & (T extends HTMLCanvasElement ? {
        width: number;
        height: number;
        getContext: HTMLCanvasElement["getContext"];
    } : {}
) & (T extends HTMLElementTagNameMap[TagWithSrc] ? {
        src: string;
    } : {}
) & (T extends HTMLElementTagNameMap[TagWithHref] ? {
        href: string;
    } : {}
) & (
    T extends HTMLMediaElement ? {
        play(): void;
        pause(): void;
        currentTime: number;
        readonly paused: boolean;
    } : {}
), HTMLElementEventMap>;

// type of `$`, describing $.TAG(...), $(element) and $("tag#id.class")
type DomHelper = (
    (
        <T extends keyof HTMLElementTagNameMap>(
            tagName: T,
            descriptor: ElementDescriptor<T>
        ) => DomEntity<HTMLElementTagNameMap[T]>
    )
    & (
        <T extends keyof HTMLElementTagNameMap>(
            selector: `${T}#${string}`,
            content?: T extends ContentlessTag ? void : DOMContent
        ) => DomEntity<HTMLElementTagNameMap[T]>
    )
    & (
        <T extends keyof HTMLElementTagNameMap>(
            selector: `${T}.${string}`,
            content?: T extends ContentlessTag ? void : DOMContent
        ) => DomEntity<HTMLElementTagNameMap[T]>
    )
    & (
        <T extends keyof HTMLElementTagNameMap>(
            selector: T,
            content?: T extends ContentlessTag ? void : DOMContent
        ) => DomEntity<HTMLElementTagNameMap[T]>
    )
    & (<T extends HTMLElement>(element: T) => DomEntity<T>)
    & {
        [T in keyof HTMLElementTagNameMap]: (
            descriptor: ElementDescriptor<T>
        ) => DomEntity<HTMLElementTagNameMap[T]>
    }
    & {
        [T in keyof HTMLElementTagNameMap]: T extends ContentlessTag
            ? () => DomEntity<HTMLElementTagNameMap[T]>
            : (
                content?: DOMContent
            ) => DomEntity<HTMLElementTagNameMap[T]>
    }
)

type JelEntityData = {
    dom: DOMContent;
}

type OptionalKeys<T> = {
    [K in keyof T]-?: {} extends Pick<T, K> ? K : never
}[keyof T];

type Optionals<T> = {
    [K in OptionalKeys<T>]-?: Exclude<T[K], undefined>;
}

type ForbidKey<K extends string | symbol> = Record<string | symbol, any> & Partial<Record<K, never>>;

type EventHost<API extends object | void, EventDataMap> = (
    API extends object ? API : {}
) & {
    on<E extends keyof EventDataMap>(
        eventId: E, handler: (
            this: JelEntity<EventHost<API, EventDataMap>>, data: EventDataMap[E]
        ) => void
    ): void;
}

const styleProxy: ProxyHandler<() => CSSStyleDeclaration> = {
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

function createElement<Tag extends keyof HTMLElementTagNameMap>(
    tag: Tag,
    descriptor: Partial<ElementDescriptor<Tag>> | DOMContent = {}
): DomEntity<HTMLElementTagNameMap[Tag]> {
    if (isContent(descriptor)) return createElement(tag, {
        content: descriptor,
    } as any);

    const domElement = document.createElement(tag);
    const ent = getWrappedElement(domElement);

    const applyClasses = (classes: ElementClassDescriptor): void => {
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

    ["value", "src", "href"].forEach(prop => {
        if ((descriptor as any)[prop] !== undefined) domElement.setAttribute(prop, (descriptor as any)[prop]);
    });

    // attribs.value / attribs.src / attribs.href override descriptor.*
    if (descriptor.attribs) {
        Object.entries(descriptor.attribs).forEach(([k, v]) => {
            if (v === false) {
                return;
            }
            domElement.setAttribute(k, v === true ? k : v as string);
        });
    }

    if ((descriptor as any).content !== undefined) recursiveAppend(domElement, (descriptor as any).content);

    if (descriptor.style) {
        ent.style(descriptor.style);
    }

    if (descriptor.cssVariables) {
        ent.setCSSVariable(descriptor.cssVariables);
    }

    if (descriptor.on) {
        Object.entries(descriptor.on).forEach(
            ([eventName, handler]) => ent.on(eventName as any, handler as any)
        );
    }

    return ent;
};

export const $ = new Proxy(createElement, {
    apply(create, _, [selectorOrTagName, contentOrDescriptor]: [
        string | HTMLElement,
        DOMContent | ElementDescriptor<any> | undefined
    ]) {

        if (selectorOrTagName instanceof HTMLElement) return getWrappedElement(selectorOrTagName);

        const tagName = selectorOrTagName.match(/^[^.#]*/)?.[0] || "";
        if (!tagName) throw new Error("Invalid tag");
        const matches = selectorOrTagName.slice(tagName.length).match(/[.#][^.#]+/g);
        const classes = {} as Record<string, boolean>;
        const descriptor = {
            classes,
            content: contentOrDescriptor,
        } as ElementDescriptor<any>;
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
        return (descriptorOrContent: ElementDescriptor<string> | DOMContent) => {
            return create(tagName, descriptorOrContent);
        };
    }
}) as DomHelper;   

const entityDataSymbol = Symbol("jelComponentData");

const elementWrapCache = new WeakMap<HTMLElement, DomEntity<any>>();
const attribsProxy: ProxyHandler<HTMLElement> = {
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

const recursiveAppend = (parent: HTMLElement, c: DOMContent) => {
    if (c === null) return;
    if (Array.isArray(c)) {
        c.forEach(item => recursiveAppend(parent, item));
        return;
    }
    if (isJelEntity(c)) {
        recursiveAppend(parent, c[entityDataSymbol].dom);
        return;
    }
    if (typeof c == "number") c = c.toString();
    parent.append(c);
};

function getWrappedElement<T extends HTMLElement>(element: T): DomEntity<T> {
    if (!elementWrapCache.has(element)) {
        const setCSSVariable = (k: string, v: any) => {
            if (v === null) {
                element.style.removeProperty("--" + k);
            } else {
                element.style.setProperty("--" + k, v)
            }
        };

        const domEntity: DomEntity<any> = {
            [entityDataSymbol]: {
                dom: element,
            },
            get element(){ return element },
            on<E extends keyof HTMLElementEventMap>(
                eventId: E,
                handler: (data: HTMLElementEventMap[E]) => void,
            ) {
                element.addEventListener(eventId, eventData => {
                    handler.call(domEntity, eventData);
                });
            },
            append(...content: DOMContent[]) {
                recursiveAppend(element, content);
            },
            remove: () => element.remove(),
            setCSSVariable(variableNameOrTable, value?) {
                if (typeof variableNameOrTable == "object") {
                    Object.entries(variableNameOrTable).forEach(
                        ([k, v]) => setCSSVariable(k, v)
                    );
                    return;
                }
                setCSSVariable(variableNameOrTable, value);
            },
            qsa(selector: string) {
                const results: (Element | DomEntity<HTMLElement>)[] = [];
                element.querySelectorAll(selector).forEach(
                    (el) => results.push(
                        el instanceof HTMLElement ? getWrappedElement(el) : el
                    ),
                );
                return results;
            },
            getRect: () => element.getBoundingClientRect(),
            focus: () => element.focus(),
            blur: () => element.blur(),
            select: () => (element as any).select(),
            play: () => (element as any).play(),
            pause: () => (element as any).pause(),
            getContext(mode: string, options?: CanvasRenderingContext2DSettings) {
                return (element as any).getContext(mode, options);
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
            get value() {
                return (element as any).value
            },
            set value(v: string) {
                (element as any).value = v;
            },
            get href() {
                return (element as any).href;
            },
            set href(v: string) {
                (element as any).href = v;
            },
            get src() {
                return (element as any).src;
            },
            set src(v: string) {
                (element as any).src = v;
            },
            get width() {
                return (element as any).width
            },
            set width(v: number) {
                (element as any).width = v;
            },
            get height() {
                return (element as any).height;
            },
            set height(v: number) {
                (element as any).height = v;
            },
            get currentTime() {
                return (element as any).currentTime;
            },
            set currentTime(v: number) {
                (element as any).currentTime = v;
            },
            get paused() {
                return (element as any).paused;
            },
            style: new Proxy(() => element.style, styleProxy) as StyleAccessor,
            classes: element.classList,
        };
        elementWrapCache.set(element, domEntity);
    }
    return elementWrapCache.get(element) as DomEntity<T>;
}

const isContent = (value: DOMContent | ElementDescriptor<string> | undefined): value is DOMContent => {
    if (value === undefined) return false;
    return typeof value == "string"
    || typeof value == "number"
    || !value
    || value instanceof Element
    || value instanceof Text
    || entityDataSymbol in value
    || Array.isArray(value);
};

function isJelEntity(content: DOMContent): content is JelEntity<object> {
    return typeof content == "object" && !!content && entityDataSymbol in content;
}

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

export function definePart<
    Spec extends ForbidKey<"on">,
    API extends ForbidKey<"on"> | void = void,
    EventDataMap extends Record<string, any> = {}
>(
    defaultOptions: Optionals<Spec>,
    init: (
        spec: Required<Spec>,
        append: (...content: DOMContent[]) => void,
        trigger: <K extends keyof EventDataMap>(eventId: K, eventData: EventDataMap[K]) => void,
    ) => API
) {
    return ((spec: Spec) => {
        const fullSpec = {
            ...defaultOptions,
            ...spec,
        } as Required<Spec> & EventSpec<EventDataMap>;

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

        let entity: JelEntity<EventHost<API, EventDataMap>>;

        const content: DOMContent[] = [];
        const append = (...c: DOMContent[]) => {
            if (entity) throw new Error("Component root content can only be added during initialisation");
            content.push(...c)
        };

        const trigger = <E extends keyof EventDataMap>(eventId: E, data: EventDataMap[E]) => {
            eventHandlers[eventId]?.forEach(fn => fn.call(entity, data));
        };

        const api = init(fullSpec, append, trigger) ?? {};

        entity = createEntity(content, Object.create(api as any, {
            on: {
                value: addEventListener,
            }
        }));

        return entity;

    }) as PartConstructor<Spec, API, EventDataMap>;
};
