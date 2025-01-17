export type ElementClassDescriptor = string | Record<string, boolean> | ElementClassDescriptor[];
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

type StylesDescriptor = Partial<{
    [key in keyof CSSStyleDeclaration]: CSSValue
}>;

interface ElementDescriptor {
    classes?: ElementClassDescriptor;
    content?: DOMContent;
    attribs?: Record<string, string | number | boolean>;
    on?: Partial<{[E in keyof HTMLElementEventMap]: (
        event: HTMLElementEventMap[E]
    ) => void}>;
    style?: StylesDescriptor;
    cssVariables?: Record<string, CSSValue>;
}

const elementProxy: ProxyHandler<CSSStyleDeclaration> = {
    get(style, prop){ 
        return style[prop as any];
    },
    set(style, prop, value) {
        style[prop as any] = value;
        return true;
    },
    apply(style, _, [styles]: [StylesDescriptor]) {
        Object.entries(styles).forEach(([prop, val]) => style[prop as any] = val as any);
    },
};

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

type CSSValue = string | number;

type ElementAPI<T extends HTMLElement> = {
    readonly element: T;
    content: DOMContent;
    classes: DOMTokenList;
    attribs: {
        [key: string]: string | null;
    },
    style: StylesDescriptor & ((styles: StylesDescriptor) => void);
    innerHTML: string;
    setCSSVariable(table: Record<string, CSSValue>): void;
    setCSSVariable(variableName: string, value: CSSValue): void;
    qsa(selector: string): DomEntity<any>[];
    append(...content: DOMContent[]): void;
    remove(): void;
    getRect(): DOMRect;
    focus(): void;
    blur(): void;
} & (T extends HTMLInputElement ? {
    value: string;
    select(): void;
} : T extends HTMLCanvasElement ? {
    width: number;
    height: number;
    getContext(contextId: "2d", options?: CanvasRenderingContext2DSettings): CanvasRenderingContext2D | null;
    getContext(contextId: "bitmaprenderer", options?: ImageBitmapRenderingContextSettings): ImageBitmapRenderingContext | null;
    getContext(contextId: "webgl", options?: WebGLContextAttributes): WebGLRenderingContext | null;
    getContext(contextId: "webgl2", options?: WebGLContextAttributes): WebGL2RenderingContext | null;
    getContext(contextId: string, options?: any): RenderingContext | null;
} : {});

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
            (ent.element.style as any)[prop] = val;
        });
    }

    if (descriptor.cssVariables) {
        Object.entries(descriptor.cssVariables).forEach(([prop, val]) => {
            ent.element.style.setProperty("--" + prop, val as any);
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
        recursiveAppend(parent, c[componentDataSymbol].dom);
        return;
    }
    if (typeof c == "number") c = c.toString();
    parent.append(c);
};

function getWrappedElement<T extends HTMLElement>(element: T): DomEntity<T> {
    if (!elementWrapCache.has(element)) {
        const domEntity: DomEntity<any> = {
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
            setCSSVariable(variableNameOrTable, value?) {
                if (typeof variableNameOrTable == "object") {
                    Object.entries(variableNameOrTable).forEach(([k, v]) => {
                        element.style.setProperty("--" + k, v as any);
                    });
                    return;
                }
                element.style.setProperty("--" + variableNameOrTable, value as any);
            },
            classes: element.classList,
            qsa(selector: string) {
                return [].slice.call(element.querySelectorAll(selector)).map(
                    (el: HTMLElement) => getWrappedElement(el)
                );
            },
            getRect() {
                return element.getBoundingClientRect();
            },
            focus() {
                element.focus();
            },
            blur() {
                element.blur();
            },
            select() {
                (element as any).select();
            },
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
            get width() {
                return (element as any).width
            },
            set width(v: number) {
                (element as any).width = v;
            },
            get height() {
                return (element as any).width;
            },
            set height(v: number) {
                (element as any).height = v;
            },
            style: new Proxy(element.style, elementProxy) as unknown as StylesDescriptor & ((styles: StylesDescriptor) => void),
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
