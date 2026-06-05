import { EmitterLike, EventEmitter, toEventEmitter } from "./emitters";
import { UnsubscribeFunc } from "./emitters/types";
import { createEmitListenPair } from "./emitters/util.js";
import { windowEvents } from "./helpers";
import { attribsProxy, createEventsProxy, styleProxy } from "./proxy.js";
import { CSSProperty, CSSValue, DOMContent, DomEntity, DomHelper, ElementClassDescriptor, ElementDescriptor, HTMLTag, SetGetStyleFunc, StyleAccessor, StylesDescriptor } from "./types.js";
import { entityDataSymbol, isContent, isJelEntity, isReactiveSource } from "./util.js";

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
    descriptor: ElementDescriptor<Tag> | DOMContent | EmitterLike<DOMContent> = {}
): DomEntity<HTMLElementTagNameMap[Tag]> {
    if (isContent(descriptor) || isReactiveSource(descriptor)) descriptor = {
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
        return (descriptorOrContent: ElementDescriptor<HTMLTag> | DOMContent | EmitterLike<DOMContent>) => {
            return create(tagName, descriptorOrContent);
        };
    }
}) as DomHelper;

const elementMutationMap = new WeakMap<Node, (v: boolean) => void>();

let mutationObserver: MutationObserver | null = null;
function observeMutations() {
    if (mutationObserver !== null) return;
    mutationObserver = new MutationObserver((mutations) => {
        const recursiveAdd = (node: Node) => {
            if (elementMutationMap.has(node)) {
                elementMutationMap.get(node)!(true);
            }
            if (node.hasChildNodes()) node.childNodes.forEach(recursiveAdd);
        };
        const recursiveRemove = (node: Node) => {
            if (elementMutationMap.has(node)) {
                elementMutationMap.get(node)!(false);
            }
            if (node.hasChildNodes()) node.childNodes.forEach(recursiveRemove);
        }
        mutations.forEach(mut => {
            mut.addedNodes.forEach(node => recursiveAdd(node));
            mut.removedNodes.forEach(node => recursiveRemove(node));
        })  
    });

    const start = () => {
        mutationObserver!.observe(document.body || document.documentElement, { childList: true, subtree: true });
    };

    if (typeof document !== "undefined") {
        if (document.body) {
            start();
        } else {
            window.addEventListener("DOMContentLoaded", start, { once: true });
        }
    }

    mutationObserver.observe(document.body, {
        childList: true,
        subtree: true
    })
}

function getWrappedElement<T extends HTMLElement>(element: T): DomEntity<T> {
    if (!elementWrapCache.has(element)) {
        const setCSSVariableDirect = (k: string, v: any) => {
            if (v === null) {
                element.style.removeProperty("--" + k);
            } else {
                element.style.setProperty("--" + k, v)
            }
        };
        const setCSSVariable = (k: string, v: CSSValue | EmitterLike<CSSValue>) => {
            if (cssVariableUnsubMap[k]) {
                cssVariableUnsubMap[k]();
                delete cssVariableUnsubMap[k];
            }
            if (isReactiveSource(v)) {
                cssVariableUnsubMap[k] = toEventEmitter(v).gate(connected$).apply(v => {
                    setCSSVariableDirect(k, v);
                });
                return;
            }

            setCSSVariableDirect(k, v);
        }

        const styleUnsubMap: Partial<Record<CSSProperty, UnsubscribeFunc>> = {};
        const cssVariableUnsubMap: Record<string, UnsubscribeFunc> = {};
        const classUnsubMap: Record<string, UnsubscribeFunc> = {};
        let contentUnsub: UnsubscribeFunc | undefined;

        function setStyle(prop: keyof StylesDescriptor, value: CSSValue | EmitterLike<CSSValue>): void
        function setStyle(prop: keyof StylesDescriptor): string
        function setStyle(prop: keyof StylesDescriptor, value?: CSSValue | EmitterLike<CSSValue>) {
            if (styleUnsubMap[prop]) {
                styleUnsubMap[prop]();
                delete styleUnsubMap[prop];
            }
            if (typeof value == "object" && value) {
                if (isReactiveSource(value)) {
                    styleUnsubMap[prop] = toEventEmitter(value)
                        .gate(connected$)
                        .apply((v: any) => element.style[prop] = v);
                    return;
                }
                value = value.toString();
            }
            if (value === undefined) {
                return element.style[prop];
            }
            element.style[prop] = value as string;
        }

        const connected = createEmitListenPair<boolean>(() => {
            elementMutationMap.set(element, connected.emit);
            observeMutations();
            return () => {
                elementMutationMap.delete(element);
            }
        });
        const connected$ = new EventEmitter(connected.listen)
            .immediate(undefined)
            .map(() => element.isConnected);

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
                recursiveAppend(element, content);
            },
            remove: () => element.remove(),
            setCSSVariable(variableNameOrTable, value?: CSSValue | EmitterLike<CSSValue>) {
                if (typeof variableNameOrTable == "object") {
                    Object.entries(variableNameOrTable).forEach(
                        ([k, v]) => setCSSVariable(k, v),
                    );
                    return;
                }
                setCSSVariable(variableNameOrTable, value!);
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
            domConnected$: connected$,
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
                if (contentUnsub) {
                    contentUnsub();
                    contentUnsub = undefined;
                }
                if (isReactiveSource(v)) {
                    contentUnsub = toEventEmitter(v).gate(connected$).apply(v => {
                        element.innerHTML = "";
                        recursiveAppend(element, v);
                    })
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
                (className, stream) => {
                    toEventEmitter(stream).gate(connected$).apply(v => element.classList.toggle(className, v));
                },
                (classNames) => {
                    classNames.forEach(c => {
                        if (classUnsubMap[c]) {
                            classUnsubMap[c]();
                            delete classUnsubMap[c];
                        }
                    });
                }
            ),
            events: createEventsProxy<HTMLElementEventMap>(element),
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
    get value() {
        return this.classList.value;
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
        this.classList.forEach((v, i) => {
            result.push(cb(v, i));
        });
        return result;
    }
}
