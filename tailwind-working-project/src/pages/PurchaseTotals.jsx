// src/pages/PurchaseTotals.jsx
import React from "react";

const fmt = (v, c) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: c, maximumFractionDigits: 2 })
    .format(Number(v || 0));

export default function PurchaseTotals({ totals }) {
  if (!totals) return null;

  const docCurr  = totals.currency || "KES";
  const baseCurr = totals.base_currency || "KES";
  const rate     = Number(totals.exchange_rate ?? 1);
  const base     = totals.base || { subtotal: 0, excise: 0, vat: 0, total: 0 };
  const doc      = totals.doc  || { subtotal: 0, excise: 0, vat: 0, total: 0 };

  // if invoice already KES, don't show anything
  if (docCurr === baseCurr) return null;

  const vatBase = Number(doc.subtotal || 0) + Number(doc.excise || 0);
  const vatPct =
    vatBase > 0 ? Math.round((Number(doc.vat) / vatBase) * 10000) / 100 : null;
  const vatLabel = vatPct ? `VAT ${vatPct}%` : "VAT";

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: 10,
        background: "#fff",
        width: 260,
        fontSize: 13,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 14 }}>Totals ({baseCurr})</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", rowGap: 4, columnGap: 10 }}>
        <div style={{ color: "#4b5563" }}>Untaxed Amount</div>
        <div style={{ textAlign: "right" }}>{fmt(base.subtotal, baseCurr)}</div>

        {Number(base.excise) ? (
          <>
            <div style={{ color: "#4b5563" }}>Excise</div>
            <div style={{ textAlign: "right" }}>{fmt(base.excise, baseCurr)}</div>
          </>
        ) : null}

        <div style={{ color: "#4b5563" }}>{vatLabel}</div>
        <div style={{ textAlign: "right" }}>{fmt(base.vat, baseCurr)}</div>

        <div style={{ fontWeight: 700, fontSize: 14 }}>Total</div>
        <div style={{ textAlign: "right", fontWeight: 700, fontSize: 14 }}>{fmt(base.total, baseCurr)}</div>

        <div style={{ gridColumn: "1 / span 2", color: "#6b7280", marginTop: 4, fontSize: 12 }}>
          Exchange: 1&nbsp;{docCurr} = {rate}&nbsp;{baseCurr}
        </div>
      </div>
    </div>
  );
}


