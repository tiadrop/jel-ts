import { $, definePart, DOMContent, ElementClassDescriptor } from "../../src/index";

export const progressBar = definePart<{
    value?: number;
    classes?: ElementClassDescriptor;
}, {
    value: number;
}, {}>({
    value: 0,
    classes: [],
}, (spec, append, trigger) => {

    let value = spec.value;
    const inner = $.div({
        classes: "jel-progress-inner",
        cssVariables: {
            fill: value,
        }
    });

    append($.div({
        classes: ["jel-progress", spec.classes],
        content: inner,
    }));

    return {
        get value(){ return value },
        set value(v: number) {
            value = v;
            inner.setCSSVariable("fill", v as any);
        }
    }
});
