/**
 * Utilidad de exportación CSV client-side, usada como respaldo/atajo
 * cuando se desea exportar exactamente el subconjunto de datos
 * actualmente visible en pantalla (ej. resultado filtrado de la tabla
 * de Estadísticas Históricas), en lugar del export server-side
 * completo servido por `GET /api/export/csv` (ver services/api.js).
 */
export function descargarCsv(filas, columnas, nombreArchivo) {
  const escape = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v).replace(/"/g, '""');
    return /[,"\n]/.test(s) ? `"${s}"` : s;
  };

  const header = columnas.map((c) => c.header).join(",");
  const body = filas
    .map((fila) => columnas.map((c) => escape(fila[c.key])).join(","))
    .join("\n");

  const csvContent = `${header}\n${body}`;
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nombreArchivo;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
