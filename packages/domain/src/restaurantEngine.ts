import type {
  RestaurantTable,
  RestaurantTableStatus,
  KitchenTicket,
  KitchenTicketStatus,
  TenantContext,
} from "@kwakopos2/contracts";

export class RestaurantEngine {
  calculateTableOccupancyRate(tables: RestaurantTable[]): number {
    if (tables.length === 0) return 0;
    const occupied = tables.filter((t) => t.status === "OCCUPIED").length;
    return Math.round((occupied / tables.length) * 100);
  }

  calculateServiceCharge(billSubtotal: number, serviceChargePct = 10): { serviceCharge: number; grandTotal: number } {
    const serviceCharge = Math.round(billSubtotal * (serviceChargePct / 100));
    return {
      serviceCharge,
      grandTotal: billSubtotal + serviceCharge,
    };
  }

  splitBillEvenly(grandTotal: number, numGuests: number): number[] {
    if (numGuests <= 1) return [grandTotal];
    const baseShare = Math.floor(grandTotal / numGuests);
    const remainder = grandTotal - baseShare * numGuests;

    const shares = Array(numGuests).fill(baseShare);
    shares[0] += remainder; // Assign any odd rounding cent/shilling to the first guest
    return shares;
  }
}
