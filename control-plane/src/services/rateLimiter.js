// Token-bucket rate limiter — real algorithm, no fakes
// Each IP (or global) gets a bucket with capacity = burst
// Bucket refills at requestsPerSecond tokens per second

class TokenBucket {
  constructor(capacity, refillRate) {
    this.capacity = capacity;       // max tokens (burst)
    this.tokens = capacity;          // current tokens
    this.refillRate = refillRate;   // tokens per second
    this.lastRefill = Date.now();
  }

  consume() {
    this._refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  _refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000; // seconds
    const toAdd = elapsed * this.refillRate;
    this.tokens = Math.min(this.capacity, this.tokens + toAdd);
    this.lastRefill = now;
  }

  getTokens() {
    this._refill();
    return Math.floor(this.tokens);
  }
}

class RateLimiter {
  constructor() {
    this.buckets = new Map();      // key -> TokenBucket
    this.config = {
      enabled: true,
      requestsPerSecond: 100,
      burst: 200,
      key: 'ip',
    };
    this.stats = {
      received: 0,
      allowed: 0,
      rateLimited: 0,
    };
    // Cleanup old buckets every 60s
    setInterval(() => this._cleanup(), 60000);
  }

  configure(config) {
    this.config = { ...this.config, ...config };
    // Clear all buckets so new config takes effect immediately
    this.buckets.clear();
  }

  check(req) {
    this.stats.received++;

    if (!this.config.enabled) {
      this.stats.allowed++;
      return { allowed: true };
    }

    const key = this._getKey(req);
    if (!this.buckets.has(key)) {
      this.buckets.set(key, new TokenBucket(
        this.config.burst,
        this.config.requestsPerSecond
      ));
    }

    const bucket = this.buckets.get(key);
    const allowed = bucket.consume();

    if (allowed) {
      this.stats.allowed++;
      return { allowed: true, remaining: bucket.getTokens() };
    } else {
      this.stats.rateLimited++;
      return {
        allowed: false,
        remaining: 0,
        retryAfter: Math.ceil(1 / this.config.requestsPerSecond),
      };
    }
  }

  _getKey(req) {
    if (this.config.key === 'ip') {
      return req.ip || req.connection?.remoteAddress || 'unknown';
    }
    return 'global';
  }

  _cleanup() {
    // Remove buckets not used in last 5 minutes
    // (simple: just clear all — buckets refill anyway)
    if (this.buckets.size > 10000) {
      this.buckets.clear();
    }
  }

  getStats() {
    return { ...this.stats };
  }

  getConfig() {
    return { ...this.config };
  }

  resetStats() {
    this.stats = { received: 0, allowed: 0, rateLimited: 0 };
  }
}

module.exports = new RateLimiter(); // singleton
