import { $, definePart, DOMContent, ElementClassDescriptor } from "../../src/index";

export const toggleButton = definePart<{
    caption?: DOMContent;
    state?: boolean;
    classes?: ElementClassDescriptor;
}, {
    state: boolean;
}, {
    change: {
        state: boolean;
    };
}>({
    caption: null,
    state: false,
    classes: [],
}, (spec, append, trigger) => {
    let state = spec.state;
    const button = $.button({
        classes: [
            "toggle-button",
            spec.classes,
            { "toggle-button-on": spec.state }
        ],
        content: spec.caption,
        on: {
            click: () => {
                state = !state;
                button.classes.toggle("toggle-button-on", state);
                trigger("change", { state });        
            },
        }
    });
    append(button);
    return {
        get state(){ return state },
        set state(v){
            button.classes.toggle("toggle-button-on", state);
            state = v;
        }
    }
});
