/** Baixa um arquivo autenticado da API (CSV/XML) — fetch direto porque é binário, não estado. */
export async function downloadFile(path: string, filename: string) {
  // o cookie httpOnly da sessão vai junto (mesma origem)
  const res = await fetch("/api" + path, { credentials: "same-origin" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Falha no download");
  }
  const url = URL.createObjectURL(await res.blob());
  Object.assign(document.createElement("a"), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
}
