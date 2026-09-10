import { Client } from '../client';
import { Resource } from '../resources';

export type ModelConstructor<T> = new (...args: any[]) => T;

export interface PaginatorOptions<T extends Resource> {
	next: (client: Client, offset: number) => Promise<T[]>;
	limit?: number;
}

/**
 * Instances of this class generate instances of T.
 * @template T A class type extending `BaseModel`
 */
export class Paginator<T extends Resource> implements AsyncIterableIterator<T> {
	protected offset = 0;
	protected readonly limit: number = 25;
	protected buffer: T[] = [];
	protected done = false;

	public constructor(protected client: Client, protected options: PaginatorOptions<T>) {
		this.client = client;
		this.limit = options.limit ?? this.limit;
	}

	public async next(): Promise<IteratorResult<T>> {
		if (this.buffer.length > 0) {
			return { done: false, value: this.buffer.shift()! };
		}
		if (this.done) {
			return { done: true, value: undefined as any };
		}
		try {
			const objects = await this.options.next(this.client, this.offset);
			this.offset += this.limit;

			if (!objects || !objects.length) {
				this.done = true;
				return { done: true, value: undefined as any };
			}

			for (const object of objects) {
				if (object !== null && object !== undefined) {
					this.buffer.push(object);
				}
			}

			if (this.buffer.length === 0) {
				this.done = true;
				return { done: true, value: undefined as any };
			}

			return { done: false, value: this.buffer.shift()! };
		} catch {
			this.done = true;
			return { done: true, value: undefined as any };
		}
	}

	public [Symbol.asyncIterator](): AsyncIterableIterator<T> {
		return this;
	}
}

export class URLPaginator<T extends Resource> extends Paginator<T> {
	public constructor(client: Client, controller: ModelConstructor<T>, url: string) {
		super(client, {
			next: async (c: Client, offset: number): Promise<T[]> => {
				return c.resources(url, controller as any, {
					params: { start_index: offset, limit: 25 },
				});
			},
		});
	}
}
