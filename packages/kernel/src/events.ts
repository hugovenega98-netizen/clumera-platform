/**
 * Eventos de dominio. Los módulos no se importan entre sí: se enteran de lo que pasa
 * por eventos guardados en la tabla de salida (outbox) y entregados al menos una vez.
 * Por eso cada consumidor debe ser idempotente usando `id`.
 */
export interface DomainEvent<TType extends string = string, TPayload = unknown> {
  /** Identificador único del acontecimiento; los consumidores lo usan para no procesarlo dos veces. */
  id: string;
  /** Nombre con forma `area.hecho`, por ejemplo `payment.approved` o `booking.confirmed`. */
  type: TType;
  occurredAt: string;
  /** Módulo o servicio que lo emitió. */
  source: string;
  payload: TPayload;
}

const EVENT_TYPE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

export function isValidEventType(type: string): boolean {
  return EVENT_TYPE.test(type);
}

export function createEvent<TType extends string, TPayload>(
  type: TType,
  source: string,
  payload: TPayload,
  options: { id?: string; now?: Date } = {},
): DomainEvent<TType, TPayload> {
  if (!isValidEventType(type)) throw new Error(`Tipo de evento inválido: ${type}`);
  return {
    id: options.id ?? globalThis.crypto.randomUUID(),
    type,
    occurredAt: (options.now ?? new Date()).toISOString(),
    source,
    payload,
  };
}

export type EventHandler<E extends DomainEvent = DomainEvent> = (event: E) => Promise<void> | void;

/**
 * Despachador en memoria. En producción lo alimenta el lector del outbox; en pruebas
 * se usa directo. No conoce a los módulos: solo tipos de evento.
 */
export class EventBus {
  readonly #handlers = new Map<string, EventHandler[]>();

  on(type: string, handler: EventHandler): () => void {
    const list = this.#handlers.get(type) ?? [];
    list.push(handler);
    this.#handlers.set(type, list);
    return () => {
      const current = this.#handlers.get(type) ?? [];
      this.#handlers.set(type, current.filter((h) => h !== handler));
    };
  }

  async dispatch(event: DomainEvent): Promise<void> {
    for (const handler of this.#handlers.get(event.type) ?? []) await handler(event);
  }
}
