import React, { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { Siren, DoorClosed, Power, ShieldCheck, History, Loader2 } from "lucide-react";
import Card from "../components/ui/Card.jsx";
import NodeSelector from "../components/dashboard/NodeSelector.jsx";
import { enviarComandoTelecontrol, getHistorialTelecontrol } from "../services/api.js";
import { NODO_POR_DEFECTO } from "../utils/constants.js";

/**
 * Panel de Telecontrol.
 *
 * Permite al operador anular manualmente el sistema autónomo,
 * publicando comandos MQTT inversos (`chancay/actuadores/comando/<nodo_id>`)
 * hacia los actuadores simulados de la cuenca (Sirena / Compuerta).
 *
 * Cada acción se valida server-side (Tab 04 del backend Node-RED) y
 * queda registrada en la bitácora de auditoría (`telecontrol_historial`).
 */

function ActuadorControl({ icon: Icon, titulo, descripcion, estado, onAccion, cargando }) {
  const activo = estado === "activar";
  return (
    <Card>
      <div className="flex items-start gap-4">
        <div
          className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${
            activo ? "bg-critical/10 text-critical" : "bg-slate_tech-100 text-slate_tech-400"
          }`}
        >
          <Icon className="w-7 h-7" strokeWidth={2} />
        </div>
        <div className="flex-1">
          <h4 className="font-display font-semibold text-slate_tech-900">{titulo}</h4>
          <p className="text-xs text-slate_tech-500 mt-0.5">{descripcion}</p>

          <div className="flex gap-2 mt-4">
            <button
              onClick={() => onAccion("activar")}
              disabled={cargando}
              className="flex-1 inline-flex items-center justify-center gap-2 text-xs font-bold rounded-lg px-3 py-2.5 bg-critical text-white hover:bg-critical/90 transition-colors disabled:opacity-50"
            >
              {cargando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}
              ACTIVAR
            </button>
            <button
              onClick={() => onAccion("desactivar")}
              disabled={cargando}
              className="flex-1 inline-flex items-center justify-center gap-2 text-xs font-bold rounded-lg px-3 py-2.5 bg-slate_tech-700 text-white hover:bg-slate_tech-800 transition-colors disabled:opacity-50"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              DESACTIVAR
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function Telecontrol() {
  const [nodoId, setNodoId] = useState(NODO_POR_DEFECTO);
  const [operador, setOperador] = useState("");
  const [cargando, setCargando] = useState(null); // actuador en progreso
  const [feedback, setFeedback] = useState(null);
  const [historial, setHistorial] = useState([]);

  const cargarHistorial = useCallback(() => {
    getHistorialTelecontrol(50)
      .then(setHistorial)
      .catch(() => setHistorial([]));
  }, []);

  useEffect(() => {
    cargarHistorial();
  }, [cargarHistorial]);

  const ejecutarComando = async (actuador, accion) => {
    setCargando(actuador);
    setFeedback(null);
    try {
      const resp = await enviarComandoTelecontrol({
        nodoId,
        actuador,
        accion,
        operador: operador || "operador_sala_monitoreo",
      });
      setFeedback({ ok: true, mensaje: `Comando "${accion.toUpperCase()}" enviado a ${actuador} (${nodoId}).` });
      cargarHistorial();
    } catch (e) {
      setFeedback({ ok: false, mensaje: e?.response?.data?.detalles?.join(", ") || "Error al enviar el comando." });
    } finally {
      setCargando(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card title="Configuración de Anulación Manual" subtitle="Seleccione el nodo objetivo y confirme su identificación">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-slate_tech-500 mb-1">Nodo Objetivo</label>
            <NodeSelector value={nodoId} onChange={setNodoId} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate_tech-500 mb-1">Operador (opcional)</label>
            <input
              type="text"
              placeholder="Nombre del operador"
              value={operador}
              onChange={(e) => setOperador(e.target.value)}
              className="text-sm border border-slate_tech-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-river-400"
            />
          </div>
        </div>

        {feedback && (
          <div
            className={`mt-4 text-sm font-medium rounded-lg px-4 py-3 ${
              feedback.ok ? "bg-aqua-500/10 text-aqua-700" : "bg-critical/10 text-critical"
            }`}
          >
            {feedback.mensaje}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ActuadorControl
          icon={Siren}
          titulo="Sirena de Alerta"
          descripcion="Anulación manual del sistema de alarma sonora del nodo seleccionado."
          onAccion={(accion) => ejecutarComando("sirena", accion)}
          cargando={cargando === "sirena"}
        />
        <ActuadorControl
          icon={DoorClosed}
          titulo="Compuerta de Desborde"
          descripcion="Control manual de la compuerta de contención hidráulica simulada."
          onAccion={(accion) => ejecutarComando("compuerta", accion)}
          cargando={cargando === "compuerta"}
        />
      </div>

      <Card
        title="Bitácora de Auditoría de Telecontrol"
        subtitle="Toda acción manual queda registrada con marca de tiempo y operador"
        actions={<History className="w-5 h-5 text-slate_tech-400" />}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate_tech-500 border-b border-slate_tech-200">
                <th className="py-2 pr-4">Fecha/Hora</th>
                <th className="py-2 pr-4">Nodo</th>
                <th className="py-2 pr-4">Actuador</th>
                <th className="py-2 pr-4">Acción</th>
                <th className="py-2 pr-4">Operador</th>
              </tr>
            </thead>
            <tbody>
              {historial.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-slate_tech-400 py-8">
                    Sin acciones de telecontrol registradas todavía.
                  </td>
                </tr>
              )}
              {historial.map((h) => (
                <tr key={h.id} className="border-b border-slate_tech-100 hover:bg-slate_tech-50">
                  <td className="py-2 pr-4 whitespace-nowrap text-slate_tech-600">
                    {format(new Date(h.ts), "dd/MM/yyyy HH:mm:ss")}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs">{h.nodo_id}</td>
                  <td className="py-2 pr-4 capitalize">{h.actuador}</td>
                  <td className="py-2 pr-4">
                    <span
                      className={`font-semibold ${h.accion === "activar" ? "text-critical" : "text-aqua-600"}`}
                    >
                      {h.accion.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-slate_tech-600">{h.operador}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
