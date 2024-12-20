/*
 * ATTENTION: The "eval" devtool has been used (maybe by default in mode: "development").
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./demo/index.ts":
/*!***********************!*\
  !*** ./demo/index.ts ***!
  \***********************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

eval("\nObject.defineProperty(exports, \"__esModule\", ({ value: true }));\nvar progressBar_1 = __webpack_require__(/*! ../examples/progressBar */ \"./examples/progressBar/index.ts\");\nvar toggleButton_1 = __webpack_require__(/*! ../examples/toggleButton */ \"./examples/toggleButton/index.ts\");\nvar index_1 = __webpack_require__(/*! ../src/index */ \"./src/index.ts\"); // from \"@xtia/jel\"\n// wrap body\nvar body = (0, index_1.$)(document.body);\n// toggle button\nbody.append(index_1.$.h2(\"Toggle button\"), (0, toggleButton_1.toggleButton)({\n    caption: \"Toggle theme\",\n    classes: \"theme-toggle\",\n    state: true,\n    on: {\n        change: function (event) { return body.classes.toggle(\"dark-mode\", event.state); },\n    }\n}));\nvar superbutton = (0, index_1.definePart)({\n    // provide default values for all optional Spec properties\n    classes: [],\n}, function (spec, append, trigger) {\n    // and an init function, where `spec` represents what might be passed to your\n    // part constructor, `append` adds DOM content to your component and `trigger`\n    // raises an event\n    var timesClicked = 0;\n    var button = index_1.$.button({\n        on: {\n            click: function () {\n                timesClicked++;\n                trigger(\"click\", { totalClicks: timesClicked });\n            },\n        }\n    });\n    var label = index_1.$.label(spec.caption);\n    append(index_1.$.div({\n        classes: [\"superbutton\", spec.classes],\n        content: [\n            button,\n            label,\n        ]\n    }));\n    return {\n        get caption() { return label.content; },\n        set caption(v) { label.content = v; },\n        get timesClicked() { return timesClicked; },\n    };\n});\n// using your new part:\nvar mySuperbutton = superbutton({\n    caption: \"Click ☝️\",\n    on: {\n        click: function (event) { return mySuperbutton.caption = \"clicks: \".concat(event.totalClicks); }\n    }\n});\nbody.append([\n    index_1.$.h2(\"Custom\"),\n    mySuperbutton,\n]);\n// progress bar\nvar demoProgressPlain = (0, progressBar_1.progressBar)();\nvar demoProgressRed = (0, progressBar_1.progressBar)({ classes: \"red-fg\" });\nvar progressDeltaButton = (0, index_1.definePart)({\n    delta: .1\n}, function (spec, append, trigger) {\n    append(index_1.$.button({\n        content: index_1.$.code([\"progressBar.value \".concat(spec.delta >= 0 ? \"+\" : \"-\", \"= \").concat(Math.abs(spec.delta))]),\n        on: {\n            click: function () {\n                demoProgressPlain.value += spec.delta;\n                demoProgressRed.value = demoProgressPlain.value;\n            }\n        }\n    }));\n});\nbody.append([\n    index_1.$.h2(\"Progress\"),\n    index_1.$.blockquote([\n        index_1.$.pre(\"progressBar()\"),\n        demoProgressPlain,\n        index_1.$.pre(\"progressBar({ appearance: \\\"bar\\\", classes: \\\"red-fg\\\" })\"),\n        demoProgressRed,\n    ]),\n    index_1.$.div([\n        progressDeltaButton({ delta: -.05 }),\n        progressDeltaButton({ delta: .06 }),\n    ]),\n]);\nvar icon = (0, index_1.definePart)({\n    // default props, typed as *props that are optional in IconSpec*\n    fontFamily: \"font-awesome\"\n}, function (spec, append, trigger) {\n    // spec is typed as IconSpec-but-nothing-is-optional - optionals are filled by above defaults\n    append(index_1.$.span({\n        classes: \"icon\",\n        style: {\n            \"--test\": 4\n        }\n    }));\n});\nconsole.log(icon({\n    iconCode: \"test\"\n}));\n\n\n//# sourceURL=webpack://jel-ts/./demo/index.ts?");

/***/ }),

/***/ "./examples/progressBar/index.ts":
/*!***************************************!*\
  !*** ./examples/progressBar/index.ts ***!
  \***************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

eval("\nObject.defineProperty(exports, \"__esModule\", ({ value: true }));\nexports.progressBar = void 0;\nvar index_1 = __webpack_require__(/*! ../../src/index */ \"./src/index.ts\");\nexports.progressBar = (0, index_1.definePart)({\n    value: 0,\n    icon: \"\",\n    classes: [],\n}, function (spec, append, trigger) {\n    var value = spec.value;\n    var inner = index_1.$.div({\n        classes: \"jel-progress-inner\",\n        style: {\n            \"--fill\": value,\n        }\n    });\n    append(index_1.$.div({\n        classes: [\"jel-progress\", spec.classes],\n        content: inner,\n    }));\n    return {\n        get value() { return value; },\n        set value(v) {\n            value = v;\n            inner.style.setProperty(\"--fill\", v);\n        }\n    };\n});\n\n\n//# sourceURL=webpack://jel-ts/./examples/progressBar/index.ts?");

/***/ }),

/***/ "./examples/toggleButton/index.ts":
/*!****************************************!*\
  !*** ./examples/toggleButton/index.ts ***!
  \****************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

eval("\nObject.defineProperty(exports, \"__esModule\", ({ value: true }));\nexports.toggleButton = void 0;\nvar index_1 = __webpack_require__(/*! ../../src/index */ \"./src/index.ts\");\nexports.toggleButton = (0, index_1.definePart)({\n    caption: null,\n    state: false,\n    classes: [],\n}, function (spec, append, trigger) {\n    var state = spec.state;\n    var button = index_1.$.button({\n        classes: [\n            \"toggle-button\",\n            spec.classes,\n            { \"toggle-button-on\": spec.state }\n        ],\n        content: spec.caption,\n        on: {\n            click: function () {\n                state = !state;\n                button.classes.toggle(\"toggle-button-on\", state);\n                trigger(\"change\", { state: state });\n            },\n        }\n    });\n    append(button);\n    return {\n        get state() { return state; },\n        set state(v) {\n            button.classes.toggle(\"toggle-button-on\", state);\n            state = v;\n        }\n    };\n});\n\n\n//# sourceURL=webpack://jel-ts/./examples/toggleButton/index.ts?");

/***/ }),

/***/ "./src/index.ts":
/*!**********************!*\
  !*** ./src/index.ts ***!
  \**********************/
/***/ (function(__unused_webpack_module, exports) {

eval("\nvar __assign = (this && this.__assign) || function () {\n    __assign = Object.assign || function(t) {\n        for (var s, i = 1, n = arguments.length; i < n; i++) {\n            s = arguments[i];\n            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))\n                t[p] = s[p];\n        }\n        return t;\n    };\n    return __assign.apply(this, arguments);\n};\nObject.defineProperty(exports, \"__esModule\", ({ value: true }));\nexports.$ = void 0;\nexports.definePart = definePart;\nfunction createElement(tag, descriptor) {\n    if (descriptor === void 0) { descriptor = {}; }\n    if (isContent(descriptor))\n        descriptor = { content: descriptor };\n    var ent = getWrappedElement(document.createElement(tag));\n    var applyClasses = function (classes) {\n        if (Array.isArray(classes)) {\n            return classes.forEach(function (c) { return applyClasses(c); });\n        }\n        if (typeof classes == \"string\") {\n            classes.trim().split(/\\s+/).forEach(function (c) { return ent.classes.add(c); });\n            return;\n        }\n        Object.entries(classes).forEach(function (_a) {\n            var className = _a[0], state = _a[1];\n            if (state)\n                applyClasses(className);\n        });\n    };\n    applyClasses(descriptor.classes || []);\n    if (descriptor.attribs) {\n        Object.entries(descriptor.attribs).forEach(function (_a) {\n            var k = _a[0], v = _a[1];\n            if (v === false) {\n                return;\n            }\n            ent.element.setAttribute(k, v === true ? k : v);\n        });\n    }\n    if (descriptor.content)\n        recursiveAppend(ent.element, descriptor.content);\n    if (descriptor.style) {\n        Object.entries(descriptor.style).forEach(function (_a) {\n            var prop = _a[0], val = _a[1];\n            if (/\\-/.test(prop)) {\n                ent.element.style.setProperty(prop, val.toString());\n            }\n            else {\n                ent.element.style[prop] = val;\n            }\n        });\n    }\n    if (descriptor.on) {\n        Object.entries(descriptor.on).forEach(function (_a) {\n            var eventName = _a[0], handler = _a[1];\n            return ent.on(eventName, handler);\n        });\n    }\n    return ent;\n}\n;\nvar isContent = function (value) {\n    return [\"string\", \"number\"].includes(typeof value)\n        || value instanceof Element\n        || value instanceof Text\n        || Array.isArray(value)\n        || !value;\n};\nexports.$ = new Proxy(createElement, {\n    apply: function (create, _, _a) {\n        var _b;\n        var selectorOrTagName = _a[0], contentOrDescriptor = _a[1];\n        if (selectorOrTagName instanceof HTMLElement)\n            return getWrappedElement(selectorOrTagName);\n        var tagName = ((_b = selectorOrTagName.match(/^[^.#]*/)) === null || _b === void 0 ? void 0 : _b[0]) || \"\";\n        if (!tagName)\n            throw new Error(\"Invalid tag\");\n        var matches = selectorOrTagName.slice(tagName.length).match(/[.#][^.#]+/g);\n        var classes = {};\n        var descriptor = {\n            classes: classes,\n            content: contentOrDescriptor,\n        };\n        matches === null || matches === void 0 ? void 0 : matches.forEach(function (m) {\n            var value = m.slice(1);\n            if (m[0] == \".\") {\n                classes[value] = true;\n            }\n            else {\n                descriptor.attribs = { id: value };\n            }\n        });\n        return create(tagName, descriptor);\n    },\n    get: function (create, tagName) {\n        return function (descriptorOrContent) {\n            return create(tagName, descriptorOrContent);\n        };\n    }\n});\nvar componentDataSymbol = Symbol(\"jelComponentData\");\nvar elementWrapCache = new WeakMap();\nvar attribsProxy = {\n    get: function (element, key) {\n        return element.getAttribute(key);\n    },\n    set: function (element, key, value) {\n        element.setAttribute(key, value);\n        return true;\n    }\n};\nvar recursiveAppend = function (parent, c) {\n    if (c === null)\n        return;\n    if (Array.isArray(c)) {\n        c.forEach(function (item) { return recursiveAppend(parent, item); });\n        return;\n    }\n    if (isJelEntity(c)) {\n        recursiveAppend(parent, c[componentDataSymbol].dom);\n        return;\n    }\n    if (typeof c == \"number\")\n        c = c.toString();\n    parent.append(c);\n};\nfunction getWrappedElement(element) {\n    var _a;\n    if (!elementWrapCache.has(element)) {\n        var domEntity_1 = (_a = {},\n            _a[componentDataSymbol] = {\n                dom: element,\n            },\n            Object.defineProperty(_a, \"element\", {\n                get: function () { return element; },\n                enumerable: false,\n                configurable: true\n            }),\n            _a.on = function (eventId, handler) {\n                element.addEventListener(eventId, function (eventData) {\n                    handler.call(domEntity_1, eventData);\n                });\n            },\n            _a.append = function () {\n                var content = [];\n                for (var _i = 0; _i < arguments.length; _i++) {\n                    content[_i] = arguments[_i];\n                }\n                recursiveAppend(element, content);\n            },\n            _a.remove = function () {\n                element.remove();\n            },\n            _a.classes = element.classList,\n            _a.qsa = function (selector) {\n                return [].slice.call(element.querySelectorAll(selector)).map(function (el) { return getWrappedElement(el); });\n            },\n            Object.defineProperty(_a, \"content\", {\n                get: function () {\n                    return [].slice.call(element.children).map(function (child) {\n                        if (child instanceof HTMLElement)\n                            return getWrappedElement(child);\n                        return child;\n                    });\n                },\n                set: function (v) {\n                    element.innerHTML = \"\";\n                    recursiveAppend(element, v);\n                },\n                enumerable: false,\n                configurable: true\n            }),\n            _a.attribs = new Proxy(element, attribsProxy),\n            Object.defineProperty(_a, \"innerHTML\", {\n                get: function () {\n                    return element.innerHTML;\n                },\n                set: function (v) {\n                    element.innerHTML = v;\n                },\n                enumerable: false,\n                configurable: true\n            }),\n            _a.style = element.style,\n            _a);\n        elementWrapCache.set(element, domEntity_1);\n    }\n    return elementWrapCache.get(element);\n}\nfunction isJelEntity(content) {\n    return typeof content == \"object\" && !!content && componentDataSymbol in content;\n}\nfunction definePart(defaultOptions, init) {\n    return (function (spec) {\n        var _a, _b;\n        var fullSpec = __assign(__assign({}, defaultOptions), spec);\n        var eventHandlers = {};\n        var addEventListener = function (eventId, fn) {\n            if (!eventHandlers[eventId])\n                eventHandlers[eventId] = [];\n            eventHandlers[eventId].push(fn);\n        };\n        if (fullSpec.on)\n            Object.entries(fullSpec.on).forEach(function (_a) {\n                var eventId = _a[0], handler = _a[1];\n                addEventListener(eventId, handler);\n            });\n        var entity;\n        var content = [];\n        var append = function (c) {\n            if (entity)\n                throw new Error(\"Component root content can only be added during initialisation\");\n            content.push(c);\n        };\n        var trigger = function (eventId, data) {\n            var _a;\n            (_a = eventHandlers[eventId]) === null || _a === void 0 ? void 0 : _a.forEach(function (fn) { return fn.call(entity, data); });\n        };\n        var api = init(fullSpec, append, trigger);\n        entity = api ? Object.create(api, (_a = {},\n            _a[componentDataSymbol] = {\n                value: {\n                    dom: content\n                }\n            },\n            _a.on = {\n                value: addEventListener,\n            },\n            _a)) : (_b = {},\n            _b[componentDataSymbol] = {\n                dom: content,\n            },\n            _b.on = addEventListener,\n            _b);\n        return entity;\n    });\n}\n;\n\n\n//# sourceURL=webpack://jel-ts/./src/index.ts?");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module can't be inlined because the eval devtool is used.
/******/ 	var __webpack_exports__ = __webpack_require__("./demo/index.ts");
/******/ 	
/******/ })()
;