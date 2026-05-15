import { $, createEntity, DOMContent, ElementClassDescriptor, SubjectEmitter } from "@xtia/jel";

type ToggleButtonOptions = {
    caption?: DOMContent;
    state?: boolean;
    classes?: ElementClassDescriptor;
    on?: {
        change?: (event: {state: boolean}) => void;
    }
};

export function toggleButton(options: ToggleButtonOptions = {}) {
    const state = new SubjectEmitter(!!options.state);

    const button = $.button({
        classes: [
            "toggle-button",
            options.classes,
            { "toggle-button-on": state }
        ],
        content: options.caption,
        on: {
            click: () => {
                state.next(!state.value);
            },
        }
    });
    return createEntity(button, {
        get state(){ return state.value },
        set state(v){
            state.next(v);
        },
        events: { change: state.asReadOnly() },
        remove: () => button.remove(),
    });
}
