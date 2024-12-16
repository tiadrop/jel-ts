import { $, definePart, DOMContent, ElementClassSpec } from "../../src/index";

export const progressBar = definePart<{
    value: number;
    icon: DOMContent;
    classes: ElementClassSpec;
}, {
    value: number;
}, {}>({
    value: 0,
    icon: "",
    classes: [],
}, (spec, append, trigger) => {
    let value = spec.value;
    const inner = $.div({
        classes: "jel-progress-inner",
        style: {
            "--fill": value,
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
            inner.style.setProperty("--fill", v as any);
        }
    }
});
