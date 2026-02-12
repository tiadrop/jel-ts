import { $, createEntity, ElementClassDescriptor, DOMContent, SubjectEmitter, createEventSource } from "../src";

type FileDropperOptions = {
	onDrop?: (files: File[]) => void;
	accept?: string; // e.g., 'image/*,.pdf'
	multiple?: boolean;
	classes?: ElementClassDescriptor;
	content?: DOMContent;
};

export function createFileDropper(options?: FileDropperOptions) {
	const dragHoverCount = new SubjectEmitter(0);
	const isDragHovering = dragHoverCount.map((n) => n > 0);
	const dropEmitter = createEventSource(options?.onDrop);

	const fileInput = $.input({
		type: "file",
		attribs: {
			multiple: options?.multiple || false,
			accept: options?.accept
		},
		style: { display: "none" },
		on: {
			change: () => {
				const files = fileInput.element.files;
				if (files && files.length > 0) {
					dropEmitter.emit(Array.from(files));
				}
				fileInput.value = "";
			}
		}
	});

	const contentEl = $.div({
		content: options?.content
	});

	const el = $.button({
		classes: [
			options?.classes,
			{
				"drag-hover": isDragHovering
			}
		],
		on: {
			click: () => fileInput.element.click(),
			dragenter: (ev) => {
				ev.preventDefault();
				ev.stopPropagation();
				dragHoverCount.next(dragHoverCount.value + 1);
			},
			dragleave: (ev) => {
				ev.preventDefault();
				ev.stopPropagation();
				dragHoverCount.next(dragHoverCount.value - 1);
			},
			dragover: (ev) => ev.preventDefault(),
			drop: (ev) => {
				ev.preventDefault();
				if (ev.dataTransfer?.files.length !== 1 && !options?.multiple) return;
				dragHoverCount.next(0);
				if (ev.dataTransfer?.files) {
					dropEmitter.emit(Array.from(ev.dataTransfer.files));
				}
			}
		},
		content: [fileInput, contentEl]
	});

	return createEntity(el, {
		events: {
			drop: dropEmitter.emitter,
			dragEnter: isDragHovering.filter((v) => v).map<void>(() => undefined),
			dragLeave: isDragHovering.filter((v) => !v).map<void>(() => undefined)
		},
		remove: () => el.remove(),
		get content() {
			return contentEl.content;
		},
		set content(v) {
			contentEl.content = v;
		}
	});
}
