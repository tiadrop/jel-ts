import { UnsubscribeFunc } from "./emitter.js";
import { attribsProxy, eventsProxy, styleProxy } from "./proxy";
import { CSSProperty, CSSValue, DOMContent, DomEntity, DomHelper, ElementClassDescriptor, ElementDescriptor, EventsAccessor, ReactiveSource, SetGetStyleFunc, StyleAccessor, StylesDescriptor } from "./types";
import { entityDataSymbol, isContent, isJelEntity } from "./util";

const elementWrapCache = new WeakMap<HTMLElement, DomEntity<any>>();

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
        if (classes === undefined) return;
        Object.entries(classes).forEach(([className, state]) => {
            if (state) applyClasses(className);
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

    if ((descriptor as any).content !== undefined) recursiveAppend(domElement, (descriptor as any).content);

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


function getWrappedElement<T extends HTMLElement>(element: T): DomEntity<T> {
    if (!elementWrapCache.has(element)) {
        const setCSSVariable = (k: string, v: any) => {
            if (v === null) {
                element.style.removeProperty("--" + k);
            } else {
                element.style.setProperty("--" + k, v)
            }
        };

        const styleListeners: Record<string, {
            subscribe: () => UnsubscribeFunc;
            unsubscribe: null | UnsubscribeFunc;
        }> = {};

        function addStyleListener(prop: CSSProperty, source: ReactiveSource<CSSValue>) {
            const subscribe = "subscribe" in source
                ? () => source.subscribe(v => element.style[prop] = v as any)
                : () => source.listen(v => element.style[prop] = v as any);
            styleListeners[prop] = {
                subscribe,
                unsubscribe: element.isConnected ? subscribe() : null,
            };
            if (!elementMutationMap.has(element)) {
                elementMutationMap.set(element, {
                    add: () => {
                        Object.values(styleListeners).forEach(l => l.unsubscribe = l.subscribe?.())
                    },
                    remove: () => {
                        Object.values(styleListeners).forEach(l => {
                            l.unsubscribe?.();
                            l.unsubscribe = null;
                        })
                    }
                })
            }
            observeMutations();
        }

        function removeStyleListener(prop: string) {
            if (styleListeners[prop].unsubscribe) {
                styleListeners[prop].unsubscribe();
            }
            delete styleListeners[prop];
            if (Object.keys(styleListeners).length == 0) {
                elementMutationMap.delete(element);
            }
        }


        function setStyle(prop: keyof StylesDescriptor, value?: CSSValue | ReactiveSource<CSSValue>): void
        function setStyle(prop: keyof StylesDescriptor): string
        function setStyle(prop: keyof StylesDescriptor, value?: CSSValue | ReactiveSource<CSSValue>) {
            if (styleListeners[prop]) removeStyleListener(prop);
            if (typeof value == "object" && value) {
                if ("listen" in value || "subscribe" in value) {
                    addStyleListener(prop, value);
                    return;
                }
                value = value.toString();
            }
            if (value === undefined) {
                return prop in styleListeners
                    ? styleListeners[prop].subscribe
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
            classes: element.classList,
            events: new Proxy(element, eventsProxy) as unknown as EventsAccessor
        };
        elementWrapCache.set(element, domEntity);
    }
    return elementWrapCache.get(element) as DomEntity<T>;
}
