// Los módulos pesados (jsPDF, autotable) se cargan bajo demanda. Si la pestaña
// —o la app instalada— quedó abierta desde antes de un deploy, el chunk que
// pide ya no existe en el servidor y llega HTML en su lugar («'text/html' is
// not a valid JavaScript MIME type»). main.jsx recarga la página sola la
// primera vez; esto traduce el error para cuando la recarga no haya curado.
export async function cargarModulos(...cargas) {
  try {
    return await Promise.all(cargas.map((c) => c()))
  } catch (err) {
    if (/MIME|module|import|fetch/i.test(String(err?.message ?? err))) {
      throw new Error('El sistema se actualizó mientras esta pestaña estaba abierta. Recarga la página e intenta de nuevo.')
    }
    throw err
  }
}
