import { UnsubscribeFunc } from "./emitter.js";
import { attribsProxy, eventsProxy, styleProxy } from "./proxy";
import { CSSProperty, CSSValue, DOMContent, DomEntity, DomHelper, ElementClassDescriptor, ElementDescriptor, EventsAccessor, HTMLTag, EmitterLike, SetGetStyleFunc, StyleAccessor, StylesDescriptor } from "./types";
import { entityDataSymbol, isContent, isJelEntity, isReactiveSource } from "./util";

const elementWrapCache = new WeakMap<HTMLElement, DomEntity<any>>();

const recursiveAppend = (parent: HTMLElement, c: DOMContent) => {
    if (c === null || c === undefined) return;
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

function createElement<Tag extends HTMLTag>(
    tag: Tag,
    descriptor: ElementDescriptor<Tag> | DOMContent = {}
): DomEntity<HTMLElementTagNameMap[Tag]> {
    if (isContent(descriptor)) descriptor = {
        content: descriptor,
    } as ElementDescriptor<Tag>;

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
        if (classes === undefined) return;
        Object.entries(classes).forEach(([className, state]) => {
            if (isReactiveSource(state)) {
                ent.classes.toggle(className, state);
            } else if (state) {
                applyClasses(className);
            }
        });
    };

    applyClasses(descriptor.classes || []);

    ["value", "src", "href", "width", "height", "type", "name"].forEach(prop => {
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

    if ("content" in descriptor) {
        (ent as any).content = descriptor.content;
    }

    if (descriptor.style) {
        ent.style(descriptor.style);
    }

    if (descriptor.cssVariables) {
        ent.setCSSVariable(descriptor.cssVariables);
    }

    if (descriptor.on) {
        Object.entries(descriptor.on).forEach(
            ([eventName, handler]) => ent.events[eventName as keyof HTMLElementEventMap].apply(handler as any)
        );
    }

    if (descriptor.init) descriptor.init(ent);

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
    get(create, tagName: HTMLTag) {
        return (descriptorOrContent: ElementDescriptor<HTMLTag> | DOMContent) => {
            return create(tagName, descriptorOrContent);
        };
    }
}) as DomHelper;

const elementMutationMap = new WeakMap<Node, {
    add: () => void;
    remove: () => void;
}>();

let mutationObserver: MutationObserver | null = null;
function observeMutations() {
    if (mutationObserver !== null) return;
    mutationObserver = new MutationObserver((mutations) => {
        const recursiveAdd = (node: Node) => {
            if (elementMutationMap.has(node)) {
                elementMutationMap.get(node)!.add();
            }
            if (node.hasChildNodes()) node.childNodes.forEach(recursiveAdd);
        };
        const recursiveRemove = (node: Node) => {
            if (elementMutationMap.has(node)) {
                elementMutationMap.get(node)!.remove();
            }
            if (node.hasChildNodes()) node.childNodes.forEach(recursiveRemove);
        }
        mutations.forEach(mut => {
            mut.addedNodes.forEach(node => recursiveAdd(node));
            mut.removedNodes.forEach(node => recursiveRemove(node));
        })  
    });
    mutationObserver.observe(document.body, {
        childList: true,
        subtree: true
    })
}

type PropertyListener = {
    subscribe: () => UnsubscribeFunc;
    unsubscribe: UnsubscribeFunc | null;
}

function getWrappedElement<T extends HTMLElement>(element: T): DomEntity<T> {
    if (!elementWrapCache.has(element)) {
        const setCSSVariable = (k: string, v: any) => {
            if (v === null) {
                element.style.removeProperty("--" + k);
            } else {
                element.style.setProperty("--" + k, v)
            }
        };

        const listeners: {
            style: Record<string, PropertyListener>;
            cssVariable: Record<string, PropertyListener>;
            content: Record<string, PropertyListener>;
            class: Record<string, PropertyListener>;
        } = {
            style: {},
            cssVariable: {},
            content: {},
            class: {},
        };

        function addListener(type: keyof typeof listeners, prop: string, source: EmitterLike<any>) {
            const set = {
                style: (v: any) => element.style[prop as CSSProperty] = v,
                cssVariable: (v: any) => setCSSVariable(prop, v),
                content: (v: any) => {
                    element.innerHTML = "";
                    recursiveAppend(element, v);
                },
                class: (v: any) => element.classList.toggle(prop, v),
            }[type];
            const subscribe = "subscribe" in source
                ? () => source.subscribe(set)
                : () => source.listen(set);
            
            listeners[type][prop] = {
                subscribe,
                unsubscribe: element.isConnected ? subscribe() : null,
            };
            if (!elementMutationMap.has(element)) {
                elementMutationMap.set(element, {
                    add: () => {
                        Object.values(listeners).forEach(group => {
                            Object.values(group).forEach(l => l.unsubscribe = l.subscribe());
                        });
                    },
                    remove: () => {
                        Object.values(listeners).forEach(group => {
                            Object.values(group).forEach(l => {
                                l.unsubscribe?.();
                                l.unsubscribe = null;
                            })
                        })
                    }
                })
            }
            observeMutations();
        }

        function removeListener(type: keyof typeof listeners, prop: string) {
            if (listeners[type][prop].unsubscribe) {
                listeners[type][prop].unsubscribe();
            }
            delete listeners[type][prop];
            if (!Object.keys(listeners).some(group => Object.keys(group).length == 0)) {
                elementMutationMap.delete(element);
            }
        }


        function setStyle(prop: keyof StylesDescriptor, value?: CSSValue | EmitterLike<CSSValue>): void
        function setStyle(prop: keyof StylesDescriptor): string
        function setStyle(prop: keyof StylesDescriptor, value?: CSSValue | EmitterLike<CSSValue>) {
            if (listeners.style[prop]) removeListener("style", prop);
            if (typeof value == "object" && value) {
                if ("listen" in value || "subscribe" in value) {
                    addListener("style", prop, value);
                    return;
                }
                value = value.toString();
            }
            if (value === undefined) {
                return prop in listeners
                    ? listeners.style[prop].subscribe
                    : element.style[prop];
            }
            element.style[prop] = value as string;
        }

        const domEntity: DomEntity<any> = {
            [entityDataSymbol]: {
                dom: element,
            },
            get element(){ return element },
            on<E extends keyof HTMLElementEventMap>(
                eventId: E,
                handler: (data: HTMLElementEventMap[E]) => void,
            ) {
                const fn = (eventData: HTMLElementEventMap[E]) => {
                    handler.call(domEntity, eventData);
                };
                element.addEventListener(eventId, fn);
                return () => element.removeEventListener(eventId, fn);

            },
            append(...content: DOMContent[]) {
                if (listeners.content?.[""]) removeListener("content", "");
                recursiveAppend(element, content);
            },
            remove: () => element.remove(),
            setCSSVariable(variableNameOrTable, value?) {
                if (typeof variableNameOrTable == "object") {
                    Object.entries(variableNameOrTable).forEach(
                        ([k, v]) => {
                            if (isReactiveSource(v)) {
                                addListener("cssVariable", k, v);
                                return;
                            }
                            setCSSVariable(k, v);
                        }
                    );
                    return;
                }
                if (listeners.cssVariable[variableNameOrTable]) removeListener("cssVariable", variableNameOrTable);
                if (isReactiveSource(value)) {
                    addListener("cssVariable", variableNameOrTable, value);
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
            set content(v: DOMContent | EmitterLike<DOMContent>) {
                if (listeners.content?.[""]) removeListener("content", "");
                if (isReactiveSource(v)) {
                    addListener("content", "", v);
                    return;
                }
                element.innerHTML = "";
                recursiveAppend(element, v as DOMContent);
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
            get name() {
                return element.getAttribute("name");
            },
            set name(v: string | null) {
                if (v === null) {
                    element.removeAttribute("name");
                } else {
                    element.setAttribute("name", v);
                }
            },
            style: new Proxy<SetGetStyleFunc>(setStyle as any, styleProxy) as unknown as StyleAccessor,
            classes: new ClassAccessor(
                element.classList,
                (className, stream) => addListener("class", className, stream),
                (classNames) => {
                    classNames.forEach(c => {
                        if (listeners.class[c]) removeListener("class", c);
                    });
                }
            ),
            events: new Proxy(element, eventsProxy) as unknown as EventsAccessor
        };
        elementWrapCache.set(element, domEntity);
    }
    return elementWrapCache.get(element) as DomEntity<T>;
}

export class ClassAccessor {
    constructor(
        private classList: DOMTokenList,
        private listen: (className: string, stream: EmitterLike<boolean>) => void,
        private unlisten: (classNames: string[]) => void,
    ) {}
    add(...className: string[]) {
        this.unlisten(className);
        this.classList.add(...className);
    }
    remove(...className: string[]) {
        this.unlisten(className);
        this.classList.remove(...className);
    }
    toggle(className: string, value?: boolean): boolean
    toggle(className: string, value: EmitterLike<boolean>): void
    toggle(className: string, value?: boolean | EmitterLike<boolean>) {
        this.unlisten([className]);
        if (isReactiveSource(value)) {
            this.listen(className, value);
            return;
        }
        return this.classList.toggle(className, value);
    }
    contains(className: string) {
        return this.classList.contains(className);
    }
    get length() {
        return this.classList.length;
    }
    toString() {
        return this.classList.toString();
    }
    replace(token: string, newToken: string) {
        this.unlisten([token, newToken]);
        this.classList.replace(token, newToken);
    }
    forEach(cb: (token: string, idx: number) => void) {
        this.classList.forEach(cb);
    }
    map<R>(cb: (token: string, idx: number) => R) {
        const result: R[] = [];
        const entries = this.classList.entries();
        let entry = entries.next();
        while (!entry.done) {
            const [idx, value] = entry.value;
            result.push(cb(value, idx));
            entry = entries.next();
        }
        return result;
    }
}
