import { $, createEntity, ElementClassDescriptor } from "../../src/index";
import { SubjectEmitter } from "../../src/internal/emitter";

export const progressBar = (spec: {
    value?: number;
    classes?: ElementClassDescriptor;
} | number = 0) => {

    if (typeof spec == "number") spec = {value: spec};
    if (spec.value === undefined) spec.value = 0;

    const valueEmitter = new SubjectEmitter(spec.value);

    const element = $.div({
        classes: ["jel-progress", spec.classes],
        content: $.div({
            classes: "jel-progress-inner",
            style: {
                width: valueEmitter.map(n => n * 100 + "%"),
            }
        }),
    });

    const api = {
        get value(){ return valueEmitter.value },
        set value(v: number) {
            valueEmitter.next(v);
        },
        remove() {
            element.remove();
        }
    };

    return createEntity(element, api);
};
