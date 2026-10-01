/** Baixa um arquivo autenticado da API (CSV/XML) — fetch direto porque é binário, não estado. */
export async function downloadFile(path: string, filename: string, token: string | null) {
  const res = await fetch("/api" + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Falha no download");
  }
  const url = URL.createObjectURL(await res.blob());
  Object.assign(document.createElement("a"), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
}
