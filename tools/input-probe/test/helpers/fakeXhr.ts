/**
 * Minimal XMLHttpRequest stand-in that records requests and lets a test resolve them.
 */

/** One recorded request. */
export class FakeXhr {
  /** Every instance created, oldest first. */
  static instances: FakeXhr[] = [];
  /** When set, `send()` throws this. */
  static throwOnSend: unknown = null;

  method = '';
  url = '';
  async = true;
  timeout = 0;
  status = 0;
  body: string | null = null;
  headers: Record<string, string> = {};
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;

  constructor() {
    FakeXhr.instances.push(this);
  }

  /** Forgets all instances and failure modes. */
  static reset(): void {
    FakeXhr.instances = [];
    FakeXhr.throwOnSend = null;
  }

  /** The most recent instance. */
  static get last(): FakeXhr {
    const x = FakeXhr.instances[FakeXhr.instances.length - 1];
    if (!x) throw new Error('no XHR created');
    return x;
  }

  open(method: string, url: string, async = true): void {
    this.method = method;
    this.url = url;
    this.async = async;
  }

  setRequestHeader(name: string, value: string): void {
    this.headers[name] = value;
  }

  send(body: string): void {
    if (FakeXhr.throwOnSend !== null) throw FakeXhr.throwOnSend;
    this.body = body;
  }

  /** Completes the request with an HTTP status. */
  respond(status: number): void {
    this.status = status;
    this.onload?.();
  }

  /** Fails the request with a network error. */
  failNetwork(): void {
    this.onerror?.();
  }

  /** Fails the request with a timeout. */
  failTimeout(): void {
    this.ontimeout?.();
  }

  /** Parsed JSON body. */
  json<T = Record<string, unknown>>(): T {
    return JSON.parse(this.body ?? 'null') as T;
  }
}
