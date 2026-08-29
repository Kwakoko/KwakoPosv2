"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductionAuditStream = void 0;
const crypto_1 = require("crypto");
class ProductionAuditStream {
    static events = [];
    static record(event) {
        const fullEvent = {
            eventId: `AUD-${(0, crypto_1.randomUUID)()}`,
            timestamp: new Date().toISOString(),
            ...event,
        };
        this.events.push(fullEvent);
        // Keep up to 1,000 in-memory operational audit entries
        if (this.events.length > 1000) {
            this.events.shift();
        }
        return fullEvent;
    }
    static getRecentEvents(limit = 100) {
        return [...this.events].slice(-limit).reverse();
    }
    static filterEvents(criteria) {
        return this.events
            .filter((e) => {
            if (criteria.eventType && e.eventType !== criteria.eventType)
                return false;
            if (criteria.appVersion && e.releaseContext.appVersion !== criteria.appVersion)
                return false;
            if (criteria.actorEmail && e.actor.email !== criteria.actorEmail)
                return false;
            return true;
        })
            .slice(-(criteria.limit || 100))
            .reverse();
    }
}
exports.ProductionAuditStream = ProductionAuditStream;
//# sourceMappingURL=productionAuditStream.js.map