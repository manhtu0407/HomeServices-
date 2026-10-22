import { pathToFileURL } from "node:url";
const m = await import(pathToFileURL("C:/ns-fix/b4/supabase/functions/mobile-api/_shared/domains/payment/manual-bank.ts").href);
const code = "NS" + "A1B2C3D4E5F6G7H8J9K0L1M2".slice(0, 24);
const out = m.buildManualBankPaymentInstructions({ accountHolder: "TEST HOLDER", accountNumber: "0123456789", amount: 460000, bankCode: "VCB", paymentCode: code });
const url = new URL(out.qrImageUrl);
console.log(JSON.stringify({ origin: url.origin + url.pathname, params: Object.fromEntries(url.searchParams), transferContent: out.transferContent, sameAsCode: out.transferContent === code }));
for (const bad of [{ amount: 0 }, { amount: -5 }, { amount: 1.5 }, { paymentCode: "BAD" }]) {
  try { m.buildManualBankPaymentInstructions({ accountHolder: "H", accountNumber: "1", amount: 1000, bankCode: "VCB", paymentCode: code, ...bad }); console.log("ACCEPTED", JSON.stringify(bad)); } catch (e) { console.log("refused", JSON.stringify(bad), e.message); }
}
