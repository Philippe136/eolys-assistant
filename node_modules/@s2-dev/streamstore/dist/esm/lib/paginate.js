import createDebug from "debug";
const debug = createDebug("s2:paginate");
/**
 * Creates a lazy async iterable that automatically paginates through all results.
 *
 * @template TItem The type of items being paginated
 * @template TArgs The query arguments type
 * @param fetcher Function that fetches a single page of results
 * @param args Query arguments (startAfter is managed internally)
 * @param getCursor Function to extract the cursor value from an item for the next page
 * @returns An async iterable that yields items one at a time, fetching pages as needed
 *
 * @example
 * ```ts
 * const allBasins = paginate(
 *   (args) => this.list(args).then(r => ({ items: r.basins, hasMore: r.hasMore })),
 *   { prefix: "my-" },
 *   (basin) => basin.name
 * );
 *
 * for await (const basin of allBasins) {
 *   console.log(basin.name);
 * }
 * ```
 */
export function paginate(fetcher, args, getCursor) {
    return {
        [Symbol.asyncIterator]: async function* () {
            let cursor;
            while (true) {
                debug({ args, cursor });
                const { items, hasMore } = await fetcher({
                    ...args,
                    startAfter: cursor,
                });
                for (const item of items) {
                    yield item;
                }
                if (!hasMore || items.length === 0) {
                    break;
                }
                // Safe: we just checked items.length > 0
                cursor = getCursor(items[items.length - 1]);
            }
        },
    };
}
/**
 * Filters an async iterable, yielding only items that match the predicate.
 *
 * @template T The type of items in the iterable
 * @param source The async iterable to filter
 * @param predicate Function that returns true for items to keep
 * @returns A new async iterable yielding only matching items
 */
export function filterAsync(source, predicate) {
    return {
        [Symbol.asyncIterator]: async function* () {
            for await (const item of source) {
                if (predicate(item)) {
                    yield item;
                }
            }
        },
    };
}
//# sourceMappingURL=paginate.js.map