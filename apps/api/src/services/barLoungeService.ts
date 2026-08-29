import { BarLoungeEngine } from "@kwakopos2/domain";
import {
  VenueMasterRecord,
  TableMasterRecord,
  GuestTabRecord,
  BarLoungeFinancialSummary,
} from "@kwakopos2/contracts";

export class BarLoungeService {
  private engine = new BarLoungeEngine();

  private mockVenues: VenueMasterRecord[] = [
    {
      id: "v1111111-1111-1111-1111-111111111111",
      venueCode: "VEN-001",
      venueName: "Skyline Lounge & Bar",
      venueType: "ROOFTOP_LOUNGE",
      totalTablesCount: 30,
      activeTabCount: 8,
      createdAt: "2026-01-01T00:00:00Z",
    },
  ];

  private mockTables: TableMasterRecord[] = [
    {
      id: "tbl-01",
      tableNumber: "T-01",
      venueId: "v1111111-1111-1111-1111-111111111111",
      sectionName: "VIP Terrace",
      capacity: 4,
      status: "ACTIVE_TAB",
      currentTabId: "tab-101",
    },
  ];

  private mockTabs: GuestTabRecord[] = [
    {
      id: "tab-101",
      tabNumber: "TAB-2026-001",
      venueId: "v1111111-1111-1111-1111-111111111111",
      tableId: "tbl-01",
      serverId: "srv-01",
      guestName: "John Doe",
      orderedItems: [
        {
          menuItemId: "item-01",
          itemName: "Premium Gin Cocktail",
          quantity: 2,
          unitPriceUsd: 15,
          totalUsd: 30,
        },
      ],
      subtotalUsd: 30,
      taxTotalUsd: 4.8,
      discountUsd: 0,
      grandTotalUsd: 34.8,
      paidAmountUsd: 34.8,
      status: "CLOSED",
    },
  ];

  public getVenues(): VenueMasterRecord[] {
    return this.mockVenues;
  }

  public getTables(): TableMasterRecord[] {
    return this.mockTables;
  }

  public getTabs(): GuestTabRecord[] {
    return this.mockTabs;
  }

  public getFinancialSummary(): BarLoungeFinancialSummary {
    return this.engine.calculateBarFinancialSummary(this.mockTabs, 50);
  }
}

export const globalBarLoungeService = new BarLoungeService();
