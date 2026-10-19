export const delay = (ms: number) =>
  new Promise<void>((r) => setTimeout(r, ms));
export class BoundedPool {
  active = 0;
  queue: {
    resolve: () => void;
    reject: (e: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }[] = [];
  constructor(
    public capacity: number,
    private queueLimit = 100,
  ) {}
  async acquire() {
    const start = performance.now();
    if (this.active >= this.capacity) {
      if (this.queue.length >= this.queueLimit)
        throw new Error("Resource queue full");
      await new Promise<void>((resolve, reject) => {
        const item = {
          resolve,
          reject,
          timer: setTimeout(() => {
            this.queue = this.queue.filter((i) => i !== item);
            reject(new Error("Resource wait timeout"));
          }, 2000),
        };
        this.queue.push(item);
      });
    } else this.active++;
    let released = false;
    return {
      wait: performance.now() - start,
      release: () => {
        if (released) return;
        released = true;
        const next = this.queue.shift();
        if (next) {
          clearTimeout(next.timer);
          next.resolve();
        } else this.active--;
      },
    };
  }
}
