import type { PaymentMethod, PaymentProvider } from "@kwakopos2/contracts";

export interface ProcessPaymentInput {
  tenantId: string;
  branchId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  provider?: PaymentProvider;
  providerReference?: string;
  customerId?: string;
  customerCreditLimit?: number;
  customerCurrentBalance?: number;
}

export interface ProcessPaymentResult {
  success: boolean;
  paymentStatus: "COMPLETED" | "PENDING" | "FAILED";
  reference: string;
  providerStatus?: string;
  error?: string;
  newCustomerBalance?: number;
}

export class PaymentEngine {
  /**
   * Processes a multi-method payment including cash, credit, card, and Tanzanian mobile money adapters.
   */
  static processPayment(input: ProcessPaymentInput): ProcessPaymentResult {
    if (input.amount <= 0) {
      return { success: false, paymentStatus: "FAILED", reference: "", error: "Payment amount must be positive." };
    }

    // 1. Credit Sale Policy Check
    if (input.paymentMethod === "CREDIT") {
      if (!input.customerId) {
        return { success: false, paymentStatus: "FAILED", reference: "", error: "Credit sale requires a registered customer." };
      }
      const limit = input.customerCreditLimit || 0;
      const current = input.customerCurrentBalance || 0;
      const newBal = current + input.amount;
      if (newBal > limit) {
        return {
          success: false,
          paymentStatus: "FAILED",
          reference: "",
          error: `Credit limit exceeded. Limit: ${limit}, Current: ${current}, Requested: ${input.amount}, Exceeds by: ${newBal - limit}`,
        };
      }
      return {
        success: true,
        paymentStatus: "COMPLETED",
        reference: `CREDIT-${Date.now()}`,
        newCustomerBalance: newBal,
      };
    }

    // 2. Mobile Money Providers (M-Pesa, Airtel Money, Tigo Pesa, HaloPesa)
    if (input.paymentMethod === "MOBILE_MONEY") {
      const provider = input.provider || "MPESA";
      const reference = input.providerReference || `${provider}-${Date.now()}`;
      return {
        success: true,
        paymentStatus: "COMPLETED",
        reference,
        providerStatus: "SUCCESSFUL_CONFIRMATION",
      };
    }

    // 3. Cash / Card / Bank
    return {
      success: true,
      paymentStatus: "COMPLETED",
      reference: `${input.paymentMethod}-${Date.now()}`,
    };
  }

  /**
   * Allocates payments against total sale amount and determines final payment status.
   */
  static evaluateSalePaymentStatus(
    grandTotal: number,
    payments: { amount: number; status: string }[]
  ): { totalPaid: number; remainingBalance: number; paymentStatus: "PAID" | "PARTIAL" | "UNPAID" } {
    const validPayments = payments.filter((p) => p.status === "COMPLETED");
    const totalPaid = validPayments.reduce((acc, p) => acc + p.amount, 0);
    const remainingBalance = Math.max(0, grandTotal - totalPaid);

    let paymentStatus: "PAID" | "PARTIAL" | "UNPAID" = "UNPAID";
    if (totalPaid >= grandTotal) {
      paymentStatus = "PAID";
    } else if (totalPaid > 0) {
      paymentStatus = "PARTIAL";
    }

    return {
      totalPaid: Math.round(totalPaid * 100) / 100,
      remainingBalance: Math.round(remainingBalance * 100) / 100,
      paymentStatus,
    };
  }
}