/**
 * happy-dom defines `nodeName` on each Node subclass, leaving the getter on Node.prototype
 * returning `''`. DOMPurify caches that getter when it loads and would then see every element as
 * unnamed and strip the whole tree — a shim artifact that browsers don't have. Call this from a
 * hoisted block so it lands before DOMPurify is imported.
 *
 * Two shim gaps remain and bound what DOMPurify suites can assert: happy-dom's parser drops the
 * content of an SVG `<style>`, and removing a node skips its next sibling in the walk.
 */
export function patchNodeName(): void {
  const proto = Node.prototype;

  Object.defineProperty(proto, 'nodeName', {
    configurable: true,
    get(this: Node) {
      for (
        let prototype: object | null = Object.getPrototypeOf(this);
        prototype && prototype !== proto;
        prototype = Object.getPrototypeOf(prototype)
      ) {
        const descriptor = Object.getOwnPropertyDescriptor(prototype, 'nodeName');

        if (descriptor?.get) {
          return descriptor.get.call(this) as string;
        }
      }

      return '';
    },
  });
}
