// Fora do HTML: a CSP do servidor (helmet) não permite script inline.
document.getElementById("rever").addEventListener("click", function () {
  try { localStorage.removeItem("consent-analytics"); } catch (e) {}
  document.getElementById("ok").textContent = "Pronto: o aviso aparece de novo quando você voltar ao sistema.";
});
