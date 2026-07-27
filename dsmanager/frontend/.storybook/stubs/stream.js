// Stub for Node.js 'stream' module - used by parse5 in @storybook/addon-comments
// This provides the minimal surface area needed for browser compatibility

class EventEmitter {
  constructor() {
    this._events = {};
  }
  on(event, listener) { return this; }
  emit(event, ...args) { return false; }
  removeListener(event, listener) { return this; }
}

class Readable extends EventEmitter {
  constructor() { super(); }
  pipe() { return arguments[0]; }
  read() { return null; }
  push() { return false; }
  _read() {}
}

class Writable extends EventEmitter {
  constructor() { super(); }
  write() { return true; }
  end() {}
  _write() {}
}

class Transform extends Readable {
  constructor() { super(); }
  _transform() {}
}

class PassThrough extends Transform {}

const Stream = { Readable, Writable, Transform, PassThrough, EventEmitter };
export { Readable, Writable, Transform, PassThrough, Stream, EventEmitter };
export default Stream;
