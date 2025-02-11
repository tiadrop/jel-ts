import { $, createEntity, ElementClassDescriptor } from "../../src/index";

export const progressBar = (spec: {
    value?: number;
    classes?: ElementClassDescriptor;
} | number = 0) => {

    if (typeof spec == "number") spec = {};
    if (spec.value === undefined) spec.value = 0;

    let value = spec.value;
    const inner = $.div({
        classes: "jel-progress-inner",
        cssVariables: {
            fill: value,
        }
    });

    const api = {
        get value(){ return value },
        set value(v: number) {
            value = v;
            inner.setCSSVariable("fill", v);
        }
    };

    return createEntity($.div({
        classes: ["jel-progress", spec.classes ?? []],
        content: inner,
    }), api);
};
