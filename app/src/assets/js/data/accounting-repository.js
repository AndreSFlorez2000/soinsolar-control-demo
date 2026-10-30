export class AccountingRepository {
  constructor(client) { this.client = client; }

  async listImports() {
    const { data, error } = await this.client.from("accounting_imports").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(`No se pudo consultar el auxiliar: ${error.message}`);
    return data;
  }

  async listCenters(importId) {
    const { data, error } = await this.client.from("accounting_center_summary")
      .select("*").eq("import_id", importId).order("cost_center");
    if (error) throw new Error(`No se pudieron consultar los centros de costo: ${error.message}`);
    return data;
  }

  async listCostCenters(importId) {
    const { data, error } = await this.client.from("accounting_center_costs")
      .select("*").eq("import_id", importId).order("cost_center");
    if (error) throw new Error(`No se pudieron consultar los costos contables: ${error.message}`);
    return data;
  }

  async listParties(importId) {
    const rows = [];
    for (let start = 0; ; start += 500) {
      const { data, error } = await this.client.from("accounting_parties")
        .select("third_party_name,third_party_id,row_count").eq("import_id", importId)
        .order("third_party_name").range(start, start + 499);
      if (error) throw new Error(`No se pudieron consultar los terceros: ${error.message}`);
      rows.push(...data);
      if (data.length < 500) return rows;
    }
  }

  async summary(filters = {}) {
    const { data, error } = await this.client.rpc("accounting_query_summary_v2", {
      p_import_id: filters.importId ?? null,
      p_cost_center: filters.costCenter ?? null,
      p_account_prefix: filters.account ?? null,
      p_party: filters.party ?? null,
      p_search: filters.search ?? null,
      p_date_from: filters.dateFrom ?? null,
      p_date_to: filters.dateTo ?? null
    });
    if (error) throw new Error(`No se pudo consultar el resumen contable: ${error.message}`);
    return data?.[0] ?? { row_count: 0, center_count: 0, classified_lines: 0, total_debit: 0, total_credit: 0,
      expenses: 0, sales_costs: 0, production_costs: 0 };
  }

  async listEntries(importId, filters = {}, page = 0, pageSize = 100) {
    let query = this.client.from("accounting_entries").select("*", { count: "exact" })
      .eq("import_id", importId).order("row_number");
    if (filters.costCenters?.length) query = query.in("cost_center", filters.costCenters);
    else if (filters.costCenter) query = query.eq("cost_center", filters.costCenter);
    if (filters.account) query = query.ilike("account_code", `${String(filters.account).replace(/[%_]/g, "")}%`);
    if (filters.dateFrom) query = query.gte("movement_date", filters.dateFrom);
    if (filters.dateTo) query = query.lte("movement_date", filters.dateTo);
    if (filters.party) {
      const party = String(filters.party).replace(/[,()%_]/g, "");
      query = /^\d+$/.test(party) ? query.ilike("third_party_id", `%${party}%`)
        : query.ilike("third_party_name", `%${party}%`);
    }
    const term = String(filters.search ?? "").trim().replace(/[,()%_]/g, " ");
    if (term) query = query.or(`detail.ilike.%${term}%,third_party_name.ilike.%${term}%,third_party_id.ilike.%${term}%,account_name.ilike.%${term}%,document_number.ilike.%${term}%`);
    const { data, error, count } = await query.range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw new Error(`No se pudieron consultar los movimientos: ${error.message}`);
    return { rows: data, count: count ?? 0 };
  }

  async *rawPages(importId) {
    const pageSize = 250;
    for (let start = 0; ; start += pageSize) {
      const { data, error } = await this.client.from("accounting_entries").select("raw_cells")
        .eq("import_id", importId).order("row_number").range(start, start + pageSize - 1);
      if (error) throw new Error(`No se pudo descargar el auxiliar: ${error.message}`);
      yield data;
      if (data.length < pageSize) break;
    }
  }

  async importAuxiliary({ fileName, format, sha256, entries, metadata, onProgress }) {
    let { data: batch, error } = await this.client.from("accounting_imports")
      .select("*").eq("file_sha256", sha256).maybeSingle();
    if (error) throw new Error(`No se pudo verificar el archivo: ${error.message}`);
    if (!batch) {
      const { data: userData, error: userError } = await this.client.auth.getUser();
      if (userError || !userData?.user?.id) throw new Error("La sesión terminó. Inicia sesión nuevamente.");
      const created = await this.client.from("accounting_imports").insert({
        file_sha256: sha256, original_file_name: fileName, source_format: format,
        ...metadata, created_by: userData.user.id
      }).select("*").single();
      if (created.error) throw new Error(`No se pudo iniciar la importación: ${created.error.message}`);
      batch = created.data;
    }
    if (batch.expected_rows !== entries.length || Number(batch.total_debit) !== Number(metadata.total_debit)
      || Number(batch.total_credit) !== Number(metadata.total_credit)) {
      throw new Error("Los datos de este archivo no coinciden con la importación registrada.");
    }
    if (batch.status === "complete") return { batch, alreadyImported: true };

    const chunkSize = 100;
    for (let offset = 0; offset < entries.length; offset += chunkSize) {
      const chunk = entries.slice(offset, offset + chunkSize).map((row) => ({ ...row, import_id: batch.id }));
      const { error: insertError } = await this.client.from("accounting_entries")
        .upsert(chunk, { onConflict: "import_id,row_number", ignoreDuplicates: true });
      if (insertError) throw new Error(`La carga se detuvo en la fila ${offset + 1}: ${insertError.message}. Puedes seleccionar de nuevo el mismo archivo para reanudar.`);
      onProgress?.(Math.min(offset + chunk.length, entries.length), entries.length);
    }
    const { count, error: countError } = await this.client.from("accounting_entries")
      .select("row_number", { count: "exact", head: true }).eq("import_id", batch.id);
    if (countError || count !== entries.length) {
      throw new Error(`Se guardaron ${count ?? "?"} de ${entries.length} filas. Selecciona el mismo archivo para reanudar.`);
    }
    const completed = await this.client.from("accounting_imports")
      .update({ status: "complete" }).eq("id", batch.id).select("*").single();
    if (completed.error) throw new Error(`No se pudo comprobar el cierre de la importación: ${completed.error.message}`);
    return { batch: completed.data, alreadyImported: false };
  }
}
