// Stub for Node.js 'util' module - used by parse5 in @storybook/addon-comments

export function inherits(ctor, superCtor) {
  ctor.super_ = superCtor;
  ctor.prototype = Object.create(superCtor.prototype, {
    constructor: { value: ctor, enumerable: false, writable: true, configurable: true }
  });
}

export function promisify(fn) { return fn; }
export function deprecate(fn) { return fn; }
export function format(...args) { return args.join(' '); }
export function inspect(obj) { return JSON.stringify(obj); }
export const types = {};
export function isArray(arg) { return Array.isArray(arg); }
export function isBoolean(arg) { return typeof arg === 'boolean'; }
export function isNull(arg) { return arg === null; }
export function isNullOrUndefined(arg) { return arg == null; }
export function isNumber(arg) { return typeof arg === 'number'; }
export function isString(arg) { return typeof arg === 'string'; }
export function isUndefined(arg) { return arg === undefined; }
export function isObject(arg) { return arg !== null && typeof arg === 'object'; }
export function isFunction(arg) { return typeof arg === 'function'; }

export default {
  inherits, promisify, deprecate, format, inspect, types,
  isArray, isBoolean, isNull, isNullOrUndefined, isNumber, isString,
  isUndefined, isObject, isFunction
};
