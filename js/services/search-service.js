export class MerchantSearchService {
  constructor(repositories) {
    this.repositories = repositories;
  }

  search(query, options = {}) {
    // Browser adapter. Production may replace this with a dedicated search index without changing callers.
    return this.repositories.merchants.list({ query, limit: options.limit || 25, cursor: options.cursor || null });
  }
}
