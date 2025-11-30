import { $, createEntity, createEventSource, DOMContent, ElementClassDescriptor } from "../../src/index";

type ToggleButtonOptions = {
    caption?: DOMContent;
    state?: boolean;
    classes?: ElementClassDescriptor;
    on?: {
        change?: (event: {state: boolean}) => void;
    }
};

export function toggleButton(options: ToggleButtonOptions = {}) {
    const changeEvent = createEventSource(options.on?.change);
    let state = !!options.state;

    const button = $.button({
        classes: [
            "toggle-button",
            options.classes,
            { "toggle-button-on": state }
        ],
        content: options.caption,
        on: {
            click: () => {
                state = !state;
                button.classes.toggle("toggle-button-on", state);
                changeEvent.emit({ state });        
            },
        }
    });
    return createEntity(button, {
        get state(){ return state },
        set state(v){
            button.classes.toggle("toggle-button-on", v);
            state = v;
        }
    });
}
