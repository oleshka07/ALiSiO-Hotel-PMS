import type { AppEvents, EventName, EventPayload } from './registry';

export type { AppEvents, EventName, EventPayload };

type Handler<T extends EventName> = (payload: EventPayload<T>) => void | Promise<void>;

class EventBus {
  private handlers = new Map<EventName, Handler<EventName>[]>();

  on<T extends EventName>(event: T, handler: Handler<T>): () => void {
    const list = this.handlers.get(event) ?? [];
    list.push(handler as Handler<EventName>);
    this.handlers.set(event, list);

    return () => {
      const current = this.handlers.get(event) ?? [];
      this.handlers.set(event, current.filter(h => h !== handler));
    };
  }

  async emit<T extends EventName>(event: T, payload: EventPayload<T>): Promise<void> {
    const list = this.handlers.get(event) ?? [];
    await Promise.all(list.map(h => h(payload as EventPayload<EventName>)));
  }

  once<T extends EventName>(event: T, handler: Handler<T>): void {
    const unsub = this.on(event, (payload) => {
      unsub();
      handler(payload);
    });
  }
}

// Singleton — shared across the entire server process (survives Next.js dev hot-reloads)
const globalForEventBus = globalThis as unknown as {
  __eventBus: EventBus | undefined;
};

export const eventBus = globalForEventBus.__eventBus ?? new EventBus();

if (process.env.NODE_ENV !== 'production') {
  globalForEventBus.__eventBus = eventBus;
}
