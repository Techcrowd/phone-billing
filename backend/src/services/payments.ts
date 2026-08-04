/**
 * Přepočítá platby (`payments`) jedné faktury podle aktuálního přiřazení
 * `services.group_id`. Volá se jak po importu faktury, tak po ruční změně
 * fakturační skupiny u služby — jinak zůstanou platby "zamrzlé" ve stavu
 * skupin, jaké byly v době uploadu.
 */
export async function regenerateInvoicePayments(client: any, invoiceId: number) {
  const { rows } = await client.query(`
    SELECT s.group_id, SUM(ii.amount_with_vat) as total, SUM(ii.amount_without_vat) as total_no_vat
    FROM invoice_items ii
    JOIN services s ON s.id = ii.service_id
    WHERE ii.invoice_id = $1 AND s.group_id IS NOT NULL
    GROUP BY s.group_id
  `, [invoiceId]);

  const currentGroupIds = rows.map((r: any) => r.group_id);

  // Skupiny, které už u téhle faktury nemají žádnou položku (přeřazeno jinam) —
  // smaž jen nezaplacené platby, zaplacené necháváme (historie platby má přednost).
  await client.query(
    `DELETE FROM payments WHERE invoice_id = $1 AND is_paid = FALSE AND NOT (group_id = ANY($2::int[]))`,
    [invoiceId, currentGroupIds]
  );

  for (const gt of rows) {
    await client.query(
      `INSERT INTO payments (invoice_id, group_id, amount, amount_without_vat)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (invoice_id, group_id) DO UPDATE SET amount = EXCLUDED.amount, amount_without_vat = EXCLUDED.amount_without_vat`,
      [invoiceId, gt.group_id, gt.total, gt.total_no_vat]
    );
  }
}
